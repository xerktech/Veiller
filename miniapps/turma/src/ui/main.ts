// Phone WebView bootstrap — Turma miniapp (Foverlay port, XERK-211).
//
// Plays the role of upstream main.ts's phone half: the login card
// (phone-login.ts, near-verbatim) and the signed-in native companion
// (phone/phone.ts + phone/render.ts, near-verbatim). Two seams differ from
// upstream, per the port spec:
//
//   1. Hub REST rides the background's turma:fetch RPC (createProxyFetch) —
//      the UI's HubClient keeps its upstream fetchFn injection seam.
//   2. The glasses App lives in the background JSContext, so the phone's
//      `app` surface is an adapter forwarding commands over turma:cmd and
//      answering getState() from the hydrated turma:state broadcasts.
//
// Where upstream reloaded the page after sign-in/sign-out, the `reload`
// callback here nudges the background (turma:config-changed) and repaints.

import { createInitialState, type AppState } from "../core/app.ts";
import { isConfigured, loadConfig, type Config } from "../core/config.ts";
import { HubClient } from "../core/hub-client.ts";
import "../shared/channels.ts";
import { hydratePhoneState } from "../shared/phone-state.ts";
import { initPhoneLogin, queryPhoneLoginElements, signOut } from "./phone-login.ts";
import { mountPhone, type PhoneAppLike, type PhoneHandle } from "./phone/phone.ts";
import { createProxyFetch } from "./proxy-fetch.ts";
import { RpcStorage } from "./rpc-storage.ts";

const storage = new RpcStorage();
const proxyFetch = createProxyFetch();

let lastState: AppState = createInitialState(Date.now());
let handle: PhoneHandle | null = null;
let mountedConfigKey: string | null = null;

const els = queryPhoneLoginElements();

// ---- background -> UI observers -------------------------------------------

veiller.on("turma:state", (payload) => {
  lastState = hydratePhoneState(payload);
  handle?.render(lastState);
});
veiller.on("turma:enter-session", ({ hostKey, sessionId }) => {
  handle?.enterFromGlasses(hostKey, sessionId);
});
veiller.on("turma:rich-tail", ({ sessionId, entries }) => {
  handle?.richTail(sessionId, entries);
});
veiller.on("turma:phase", () => {
  void applyView();
});

// ---- the App adapter the phone controller drives ---------------------------

// Commands are optimistic where the phone repaints synchronously right after
// calling them (upstream's in-process calls mutated state before the paint):
// orgFilter/autoStartOrgs are patched locally so the immediate repaint shows
// the change; the background's next turma:state broadcast reconciles.
const appAdapter: PhoneAppLike = {
  getState: () => lastState,
  enterSession: (sessionId, hostKeyHint) => {
    void veiller.request("turma:cmd", { kind: "enterSession", sessionId, hostKey: hostKeyHint }).catch(() => {});
  },
  setOrgFilter: (siteKey) => {
    lastState = { ...lastState, orgFilter: siteKey || "" };
    void veiller.request("turma:cmd", { kind: "setOrgFilter", siteKey }).catch(() => {});
  },
  setAutoStartOrg: (siteKey, enabled) => {
    // Null-prototype copy: on a {...spread} copy, next["__proto__"] = true sets
    // the prototype instead of adding the key (XERK-1490).
    const next: Record<string, boolean> = Object.assign(Object.create(null), lastState.autoStartOrgs);
    if (enabled) next[siteKey] = true;
    else delete next[siteKey];
    lastState = { ...lastState, autoStartOrgs: next };
    void veiller.request("turma:cmd", { kind: "setAutoStartOrg", siteKey, enabled }).catch(() => {});
    handle?.render(lastState);
  },
};

// ---- mount / unmount -------------------------------------------------------

function mountCompanion(config: Config): void {
  const key = `${config.hubUrl}\u0000${config.user}\u0000${config.password}`;
  if (handle && mountedConfigKey === key) return;
  unmountCompanion();
  const phoneRoot = document.getElementById("phone");
  if (!phoneRoot) return;
  // A fresh inner element per mount: mountPhone attaches delegated listeners
  // to its root, so remounting onto the same node would double-fire them.
  const inner = document.createElement("div");
  inner.style.cssText = "position:absolute;inset:0";
  phoneRoot.textContent = "";
  phoneRoot.appendChild(inner);
  const client = new HubClient({ config, fetchFn: proxyFetch });
  handle = mountPhone({
    root: inner,
    app: appAdapter,
    client,
    onSignOut: () => void signOut(storage, proxyFetch, reload),
  });
  mountedConfigKey = key;
}

function unmountCompanion(): void {
  handle = null;
  mountedConfigKey = null;
  const phoneRoot = document.getElementById("phone");
  if (phoneRoot) phoneRoot.textContent = "";
}

// Swap between the login card and the signed-in companion from the persisted
// config — the same visibility logic initPhoneLogin applies on first load.
async function applyView(): Promise<void> {
  const config = await loadConfig(storage);
  if (isConfigured(config)) {
    els.login.hidden = true;
    els.app.hidden = false;
    mountCompanion(config);
  } else {
    unmountCompanion();
    els.url.value = config.hubUrl;
    els.user.value = config.user;
    els.password.value = "";
    els.submit.disabled = false;
    els.submit.textContent = "Sign in";
    els.login.hidden = false;
    els.app.hidden = true;
  }
}

// Upstream: location.reload(). Here: tell the background the persisted
// config changed (it restarts or stops the App), then re-apply the view.
function reload(): void {
  void (async () => {
    try {
      await veiller.request("turma:config-changed", {});
    } catch (err) {
      console.warn("[turma] config-changed nudge failed:", err);
    }
    await applyView();
  })();
}

// ---- bootstrap -------------------------------------------------------------

async function bootstrap(): Promise<void> {
  veiller.ready();
  // Hydrate from the background's current snapshot so the first paint after
  // sign-in shows the fleet without waiting for the next poll's broadcast.
  try {
    const snap = await veiller.request("turma:get-state", {});
    if (snap.state) lastState = hydratePhoneState(snap.state);
  } catch {
    // background still booting — the turma:state broadcasts will catch us up
  }
  await initPhoneLogin(storage, () => void applyView(), els, proxyFetch, reload);
}

void bootstrap();
