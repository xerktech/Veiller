---
status: active
owner: malcolm.habeeb
---

# Port the Tenir and Turma Even G2 apps to Veiller bundled miniapps (XERK-211)

## What / why

Tenir (self-hosted live captions) and Turma (self-hosted Claude Code session
manager) each ship an Even Realities G2 glasses app built for **Even Hub**
(`.ehpk` WebView apps on `@evenrealities/even_hub_sdk`, sideloaded/published
through Even's portal). Veiller replaces the Even phone app entirely: it
drives the G2 over BLE itself and runs **local Veiller miniapps** (background
JS + optional phone WebView, shipped as flat zips bundled into the APK).

This spec covers porting both glasses apps to local miniapps that live in this
repo under `miniapps/tenir` and `miniapps/turma`, and bundling them in
`mobile/assets/miniapps/` so every Veiller release includes them.

Upstream sources ported (latest at time of port):

- Tenir `main` @ `28a8147` (release v0.5.9) — `Tenir/even/` + `packages/client-core` + `packages/contract`
- Turma `main` @ `24437fc` (release v0.6.45) — `Turma/glasses/`

Miniapp versions mirror those releases: `com.xerktech.tenir-0.5.9`,
`com.xerktech.turma-0.6.45`. Future in-repo changes bump patch from there.

## Runtime mapping (Even Hub → Veiller miniapp)

| Even Hub | Veiller local miniapp |
|---|---|
| `.ehpk` (manifest `app.json`, WebView app) | flat zip (`miniapp.json`, `background/index.js` IIFE + `ui/index.html`) |
| Lens = LVGL containers, 576×288, 27px lines (~10 lines) | `session.display.render()` scene: text/rect elements, 576×288, 40px lines (~7 lines), ≤6 text/rect elements |
| `audioControl(true)` + `audioEvent` (16kHz s16le mono ~100ms chunks) | `session.mic.onAudioChunk` (base64 `pcm_s16le` @16k) — same wire format after decode |
| `sysEvent`/`textEvent` gestures | `session.input.onTouch`: `single_tap`→tap, `double_tap`→doubleTap, `swipe_up`→scrollUp, `swipe_down`→scrollDown |
| `getLocalStorage`/`setLocalStorage` | `session.storage` (string KV, MMKV-backed) |
| Same-WebView phone page (shared JS context with lens) | separate WebView; talks to background over `veiller` channels (`session.ui` send/on/handle) |
| `app.json` `network` whitelist (enforced at pack time) | no allowlist; background `fetch`/`WebSocket` are unrestricted (binary WS send supported) |
| Even Hub portal distribution | zip in `mobile/assets/miniapps/` → installed at app startup |

Both hubs' network protocols are unchanged: the miniapps speak the exact same
REST/WS contracts as the Even Hub apps did (Tenir `/ws` binary-PCM captions
socket, bearer token; Turma Basic-auth REST + `/live` + `/audio` ws-token
sockets), so no server-side changes are needed.

Because the miniapp phone UI runs from `file://` in a plain WebView, direct
cross-origin `fetch` from the UI is CORS-fragile. All hub/API traffic goes
through the **background script** (which has no CORS); the UI reaches it via a
proxied fetch RPC channel, so the ported phone code keeps its upstream
`fetchFn` injection seam.

## Tenir miniapp (`com.xerktech.tenir`)

Ported: sign-in (server URL + username + password → bearer token, sliding
`x-renewed-token` renewal), the captions session state machine (start/stop,
reconnect with backoff + session resume, partial/final segments), lens HUD
(status line + clock + caption band, pixel-measured wrapping via the vendored
display-utils G1 glyph tables), phone live-transcript mirror with start/stop
controls, and conversation history (list/detail/delete) on the phone page.

Adapted: `packages/client-core` (`ws.ts`, `auth.ts`, `serverUrl.ts`,
`config.ts`, `pcm.ts`) and the generated contract types are copied into
`src/core/` (workspace deps inlined). Wrapping uses the same vendored
`display-utils` the captions miniapp carries, with a G2 profile (G1 glyphs,
576px, 40px lines).

Not ported (Even-runtime pathology or deferred features): the BLE write
serializer/timeouts, the menu/cue/song/translation popup overlays (cue and
song data are still received and shown on the phone mirror; lens popups can
follow in a later change), audio download links in history (needs a browser),
and the foreground-exit-only resume heuristic (replaced by a simpler
persisted-session snapshot).

## Turma miniapp (`com.xerktech.turma`)

The upstream core is hardware-agnostic behind three interfaces
(`GlassesDisplay`, `Dictation`, `KeyValueStorage`), so `app.ts`, `render.ts`,
`input-box.ts`, `reveal.ts`, `transcript.ts`, `sessions.ts`, `text-wrap.ts`,
`hub-client.ts`, `live.ts`, `config.ts`, `types.ts` port **verbatim** with
their tests. New Veiller backends:

- `display/veiller.ts` — `ScreenModel` → scene elements: transcript text,
  bordered bottom box (rect + text), right-corner status text; debounced like
  upstream (`display/debounce.ts` ports as-is).
- `layout.ts` geometry: `DISPLAY_LINES = 7` (288px / 40px lines),
  `LINE_WIDTH_PX = 560`, measure via the vendored G1 glyph measurer
  (`setDefaultMeasure`), so `BOTTOM_MAX_LINES`/`MENU_MAX_LINES` and all
  windowing derive automatically.
- `audio.ts` `AudioRecorder` keeps its WS ordering discipline; its bridge
  becomes `session.mic` subscribe/unsubscribe (mic-on = first `audio_chunk`
  subscriber) feeding the hub `/audio` socket unchanged.
- Storage backend on `session.storage` under the upstream key
  (`turma.glasses.config`).

Phone companion: the XERK-171 native companion (Sessions + Board, vendored
`chat.cjs`/`board.cjs` engines) ports into the miniapp UI. Upstream it shares
one JS context with the lens app; here the `App` observer/command seam
(`onState`/`onEnterSession`/`onRichTail` out, `enterSession`/`setOrgFilter`/
`setAutoStartOrg` in) crosses the background↔WebView channel bus instead, and
hub REST uses the proxied fetch RPC.

Not ported: the ttyd terminal pane (needs WebView-jar cookies the background
proxy can't plant — the Terminal toggle is hidden), and the Even exit-confirm
dialog (`requestExit` is a no-op; Veiller owns app lifecycle).

## Shipping

`miniapps/<name>` are bun workspaces like `miniapps/captions`: `build.ts`
(background IIFE + UI build), `bun run pack` → `build/<pkg>-<ver>.zip`, copied
into `mobile/assets/miniapps/` with `mobile/src/generated/bundledMiniapps.ts`
regenerated. `MantleManager.installBundledMiniapps()` installs them at
startup; no other registration surface is involved (icons/permissions come
from the bundle manifest).

## Verification

Ported unit suites run under each workspace (`bun run test`); zips are
verified flat with `miniapp.json` at root. On-hardware QA (pairing, mic LED
teardown paths, BLE pacing) still needs a physical G2 + hub/api instance and
is tracked as follow-up — the upstream on-hardware checklists in each repo's
README apply unchanged.
