# CLAUDE.md — Foverlay

Context for any Claude agent working in this repository. Read this fully before
planning or writing code. When this file and the actual codebase disagree, the
codebase wins — but tell me about the drift so I can update this file.

---

> **Status (2026-08-02): fork reset + new focus.** The fork was reset onto
> MentraOS `upstream/dev` — upstream now ships native Even Realities G2 support
> and the on-device miniapp SDK, which made the old fork's G2-era work dead
> weight. The pre-reset history lives on the old `main`; only the R1 ring
> RE docs/tools, CI disables, and app identity were carried over.
>
> **Current focus: the Tap Strap 2 → G2 text echo demo** (see
> `docs/tap-strap-demo.md` and `miniapps/tap-typing-demo/README.md`). The R1
> ring effort (previously goal #1) is **paused, not dead** — its findings remain
> in `docs/r1-ring-*.md` and `tools/r1-*`.

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

Fresh reset onto `upstream/dev` (Aug 2026) plus the Tap Strap 2 demo stack:

- `mobile/modules/tap-input/` — **@foverlay/tap-input** Expo module (Android):
  `TapInputService` foreground service owning the Tap Strap 2 BLE connection via
  tap-android-sdk Controller Mode; `TapAlphabet` tapcode→char table (unit
  tested); `FakeTapSource` for adb-driven development without hardware.
- `miniapps/tap-typing-demo/` — background-only miniapp that echoes tap chords
  to a text box on the G2.
- Upstream files touched (kept minimal for rebases): `engine/DeviceEventRouter.ts`
  (tap_input forwarding), miniapp SDK typed stream additions (`protocol.ts`,
  `events.ts`, `input.ts`, exports), `mobile/app.config.ts` (identity),
  `package.json`/lockfiles.

## 3. Goals (in priority order)

1. **Tap Strap 2 → G2 text echo demo** — prove typing-in-pocket works and
   measure keystroke→display latency (~120ms budget). Milestones and definition
   of done: `miniapps/tap-typing-demo/README.md`.
2. **Custom dashboard / UX** on the glasses (replace MentraOS's default home).
3. **Native phone integrations**: Calendar via `CalendarContract`, fitness via
   Health Connect (Google Fit REST is dead end-2026), messaging via Android
   default-SMS-handler APIs.
4. **Self-hosted backend** (home lab, Cloudflare Tunnel; no Tailscale) — note
   upstream is migrating miniapps *on-device* (WebView/JSContext, no server
   round-trip), which shrinks what a backend even needs to do.
5. **R1 ring** (paused): control comes free off the G2 input stream once the
   ring is bound to the glasses; health metrics need original BLE RE
   (`docs/r1-ring-capture-findings.md`).
6. **Android first.** iOS is explicitly later.

## 4. Non-goals

- iOS support (deferred; don't let iOS constraints shape Android decisions).
- Rewriting MentraOS's BLE / protobuf / audio / ASR layers.
- Publishing to the Mentra or Even app stores.
- For the tap demo specifically: mouse/cursor support, custom bitmap fonts,
  chord remapping UI, persistence/backends. See the demo README's non-goals.

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
- Tap input: `TapInputService` → `TapInputModule.sendEvent("tap_input")` →
  `DeviceEventRouter` → `forwardEvent("tap_input")` → miniapp
  `session.input.onTapInput(...)`.

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

- **Keep changes upstream-mergeable**: `upstream` remote → `Mentra-Community/MentraOS`,
  base on `upstream/dev`. Prefer additive modules (like `tap-input`) over
  editing upstream files; when upstream files must change, keep edits minimal
  and commented (`// Foverlay:`).
- **Build tooling**: bun everywhere. Note: bun 1.3.x fails to resolve the
  `file:` miniapp-cli dep when (re)installing `mobile/`; bun 1.2.x works.
- **No Even / Mentra / Tap trademarks** in product identity.
- **Respect the MIT license** (retain notices).
- Read the real MentraOS code before planning against it; it moves fast.
- When asked to plan: state understanding, cite what you actually found in the
  modules, decide native-vs-miniapp per feature, list steps + upstream-merge
  impact, flag unverified assumptions. Ask before large refactors of inherited
  code.
