# CLAUDE.md — Foverlay

Context for any Claude agent working in this repository. Read this fully before
planning or writing code. When this file and the actual codebase disagree, the
codebase wins — but tell me about the drift so I can update this file.

---

> **Status (2026-08-03): dedicated app — miniapps stripped as a product.**
> Foverlay is a dedicated app, NOT a platform others build plugins/miniapps
> for. Every user-facing miniapp surface is removed (no bundled miniapps, no
> cloud preinstall sync, no dev/QR install flows, no glasses-menu picker);
> the internal miniapp runtime remains in the tree as **inert plumbing** so
> we can keep rebasing on upstream. Foverlay features are host features —
> native modules + engine services — never miniapps.
>
> Earlier context: the fork was reset onto MentraOS `upstream/dev` on
> 2026-08-02 (upstream now ships native G2 support); pre-reset history lives
> on the old `main`. **Current focus: the Tap Strap 2 → G2 text echo** (see
> `docs/tap-strap-demo.md`), implemented as the engine service
> `TapTypingEchoService`. The R1 ring effort is **paused, not dead** —
> findings in `docs/r1-ring-*.md` and `tools/r1-*`. Mapbox is removed
> (NavigationManager stubbed) so builds need no secrets.
>
> **What survives the endgame (decision 2026-08-03).** The only inherited
> code that matters — and must NEVER be deleted in cleanups — is the **BLE
> device layer** in `mobile/modules/bluetooth-sdk`: Even G2 pairing/scan/
> dual-GATT connection management above all, the other glasses drivers too
> (G1, Live, Z100, … — cheap insurance, keep them), and **everything
> ring-related** (the G2-protocol ring binding — `switchRingHand`, ring bind
> status — plus `docs/r1-ring-*` / `tools/r1-*`). Everything above that
> layer — the RN app UI, engine runtime, miniapp plumbing, cloud client — is
> scaffolding: once the glasses↔Tap-Strap loop is proven working, the plan
> is a **fully custom Android app and glasses display system** on top of the
> preserved BLE layer. Sequencing: prove the combo first, then tear down.

## 1. What Foverlay is

Foverlay is a custom Android companion app for **Even Realities G2 smart glasses**,
forked from **MentraOS** (`Mentra-Community/MentraOS`, MIT-licensed). It replaces
the stock Even Realities app as the host / connection point for the glasses.

The name: **fovea** (the sharp-focus center of vision) + **overlay** (what a HUD
draws). It is not affiliated with Even Realities, Mentra, or Tap Systems — keep
those trademarks out of the product identity, package names, and user-facing
strings.

### The core decision: fork MentraOS, do not build BLE from scratch

MentraOS implements the hard parts on Android: G2 pairing (dual-GATT, one radio
per temple arm), display (EvenHub scene renderer with native pacing/coalescing),
microphone, touch gestures, battery. We inherit that and build above it. If an
approach starts to look like "reimplement what MentraOS already does," stop and
reconsider.

## 2. Current status

Reset onto `upstream/dev` (Aug 2026) + Tap Strap 2 stack + the miniapp
product-strip:

- `mobile/modules/tap-input/` — **@foverlay/tap-input** Expo module (Android):
  `TapInputService` foreground service owning the Tap Strap 2 BLE connection via
  tap-android-sdk Controller Mode; `TapAlphabet` tapcode→char table (unit
  tested); `FakeTapSource` for adb-driven development without hardware.
- `mobile/modules/engine/src/services/TapTypingEchoService.ts` — the echo as a
  **host engine service**: subscribes to tap events, renders the typing buffer
  through `LocalDisplayManager.request("system.tap-echo", …)`.
- Miniapp strip (all `// Foverlay:`-commented): empty `bundledMiniapps` (zips
  deleted from `mobile/assets/miniapps/`), `preinstalledMiniappSync` call
  disabled in `MantleManager`, dev tools/toggles/entries removed
  (`markMiniappDevMode` inert), glasses-menu picker entry removed,
  `useAppsExtras` filters the app list to `SYSTEM_APPS` built-ins only
  (Settings/Camera/Mirror/Feedback/Notify tiles — those are core UI, kept).
- Upstream files touched (kept minimal for rebases): `engine/engine.ts` (2-line
  service start/stop), the strip edits above, `crust` NavigationManager stub +
  gradle (Mapbox removal), `mobile/app.config.ts` (identity),
  `package.json`/lockfiles. The `@mentra/miniapp` SDK and `DeviceEventRouter`
  are pristine upstream.

## 3. Goals (in priority order)

1. **Tap Strap 2 → G2 text echo demo** — prove typing-in-pocket works and
   measure keystroke→display latency (~120ms budget). Milestones and definition
   of done: `docs/tap-strap-demo.md`.
2. **Custom dashboard / UX** on the glasses (replace MentraOS's default home).
3. **Native phone integrations**: Calendar via `CalendarContract`, fitness via
   Health Connect (Google Fit REST is dead end-2026), messaging via Android
   default-SMS-handler APIs.
4. **Self-hosted backend** (home lab, Cloudflare Tunnel; no Tailscale) — with
   miniapps stripped and features on-device, the backend surface is small.
5. **R1 ring** (paused): control comes free off the G2 input stream once the
   ring is bound to the glasses; health metrics need original BLE RE
   (`docs/r1-ring-capture-findings.md`).
6. **Android first.** iOS is explicitly later.

## 4. Non-goals

- **A miniapp/plugin platform.** Foverlay is a dedicated app. Do not implement
  features as miniapps; do not resurrect install/store/dev surfaces. The
  runtime under `mobile/modules/{miniapp,crust}` and the `miniapps/`+`sdk/`
  trees are inherited upstream plumbing currently left inert — fair game to
  delete outright (upstream-mergeability is no longer a constraint).
- iOS support (deferred; don't let iOS constraints shape Android decisions).
- Rewriting MentraOS's BLE / protobuf / audio / ASR layers.
- Publishing to the Mentra or Even app stores.
- For the tap demo specifically: mouse/cursor support, custom bitmap fonts,
  chord remapping UI, persistence/backends.

## 5. Architecture (verified against upstream dev, Aug 2026)

Miniapps run **on-device**, not through the cloud: a background JS bundle in a
native JSContext (QuickJS on Android, JSC on iOS, via the `crust` module) plus
an optional UI bundle in a WebView. The Cloud SDK path is legacy.

Key data paths:

- Native device events → RN: Expo module `sendEvent` (e.g. `BluetoothSdkModule`)
  → `@mentra/engine` `DeviceEventRouter` → `LocalMiniappRuntime.forwardEvent`
  → per-app Crust dispatch → miniapp SDK `session.events` / typed modules.
- Display: `session.display.render([...])` scene API (the old
  `layouts.showTextWall` **no longer exists**) → `LocalDisplayManager` (no JS
  throttle by design) → `SceneRenderer` → native G2 driver, which owns pacing +
  last-wins coalescing (EvenHub queue). G2 canvas is 576×288, ~7 lines of text,
  and supports bitmaps (`{type:"image"}`) too.
- Tap input: `TapInputService` (native FGS) → `TapInputModule.sendEvent("tap_input")`
  → engine `TapTypingEchoService` (subscribes via `@foverlay/tap-input`) →
  `LocalDisplayManager.request("system.tap-echo", {view:"main", scene:[…]})`.
  Host features render through LocalDisplayManager with a reserved
  `system.*` packageName — never via `SceneRenderer`/`displayEvent` directly
  (that bypasses arbitration and reconnect replay).

## 6. Repo layout (verified)

- `mobile/` — Expo RN host app. Native modules in `mobile/modules/`:
  `bluetooth-sdk` (glasses BLE, incl. `sgcs/G2.kt`), `crust` (JS contexts, nav),
  `engine` (runtime/stores/routers), `miniapp` (**the @mentra/miniapp SDK
  source**), `jspolyfill`, and our `tap-input`.
- `miniapps/` — local (island-runtime) miniapps; `captions/` is the best
  reference implementation; `tap-typing-demo/` is ours.
- `sdk/` — `miniapp-cli` (`mentra-miniapp dev|pack|release`),
  `create-mentra-miniapp`, docs in `sdk/docs/*.md`.
- `cloud-v2/` — backend packages (legacy cloud path lives here).
- `docs/` — Foverlay docs (tap demo, R1 ring RE), `tools/` — R1 capture tools.

## 7. Platform constraints (hard realities)

- **Tap in HID mode is useless for this app**: Android routes HID keys to the
  focused window; screen-off has none. Controller Mode via tap-android-sdk only.
  The Tap must be OS-paired first; the SDK attaches to bonded devices.
- **iOS SMS is impossible**; Android SMS is Play-review-gated (default-handler
  use case). Plan graceful degradation.
- **Calendar and fitness are local** (`CalendarContract`, Health Connect) — no
  OAuth flows.
- **Nothing hardcoded to MentraOS Cloud** — every cloud-facing endpoint must be
  configurable.

## 8. Conventions

- **Upstream-mergeability is NOT a goal (decision 2026-08-03).** Foverlay is
  building something different from Mentra; we are a hard fork. Upstream
  (`Mentra-Community/MentraOS`) is a parts bin to cherry-pick from (mainly the
  G2 BLE driver), not a rebase target. Edit or delete inherited code freely
  when it serves the product — including deleting the inert miniapp runtime
  wholesale when convenient. Keep tagging our edits `// Foverlay:` anyway; it
  marks intent, not rebase hygiene.
- **Build tooling**: bun everywhere. Note: bun 1.3.x fails to resolve the
  `file:` miniapp-cli dep when (re)installing `mobile/`; bun 1.2.x works.
- **No Even / Mentra / Tap trademarks** in product identity.
- **Respect the MIT license** (retain notices).
- Read the real MentraOS code before planning against it; it moves fast.
- When asked to plan: state understanding, cite what you actually found in the
  modules, decide native-vs-miniapp per feature, list steps + upstream-merge
  impact, flag unverified assumptions. Ask before large refactors of inherited
  code.
