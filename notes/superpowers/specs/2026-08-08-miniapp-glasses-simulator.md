---
status: active
owner: malcolm.habeeb
---

# Miniapp glasses simulator (XERK-230)

## Why

Miniapp bugs were only reproducible on hardware. Verifying a change meant a
phone, a paired G2, a self-hosted backend, and a person talking — so most
miniapp behaviour was never exercised outside a manual QA pass, and a report
like "Tenir is very broken" had no cheap way to be narrowed down.

`agents/miniapp-browser-testing-simulator-spec.md` sketched a full simulator as
a multi-week project and deferred it. This is the scoped version of that idea,
built to answer one question well: **what is on the lens right now, and why?**

## What it is

`sdk/miniapp-simulator` — a monorepo-only package (`bun run simulate <bundle>`,
or `veiller-miniapp simulate`). It boots a miniapp's real built bundle against a
real host implementation and draws the lens.

Its value rests on how little of it is a mock:

- **The background context** is the miniapp's actual bundle, evaluated in a
  Worker standing in for the per-miniapp JSContext: same `__dispatch` bridge,
  same `{kind:"init"}` handshake, same dual `__veiller*` / `__mentra*` ABI the
  polyfill resolves (XERK-229), so published bundles run unmodified.
- **The wire protocol** is `@veiller/miniapp`'s own enums, and the host answers
  CONNECT / SUBSCRIBE / RENDER / STORAGE_* / the `_ui` bus the way
  `LocalMiniappRuntime` does — including subscription gating, so a miniapp that
  forgot to subscribe stays silent here too.
- **The display pipeline** is `processScene` + `diffScene` from
  `mobile/modules/engine`, against the `evenRealitiesG2` capability block and
  the `G2_PROFILE` glyph table. Clamping, the 6-container budget, and
  pixel-accurate wrapping are the phone's, not an approximation.
- **The device half** applies the resulting `SceneFrame`'s change annotations to
  retained containers, so an element the host calls "unchanged" but never
  actually delivered shows up as a stale lens — the on-hardware symptom, not a
  hidden one.
- **The phone page** is the miniapp's real UI bundle, served with the app's own
  `buildVeillerUiShim` and host globals injected, bridged over a WebSocket in
  place of `ReactNativeWebView.postMessage`.

Anything the simulator does not implement answers `NOT_IMPLEMENTED` and is
listed in the panel. A gap looks like a gap.

## Two ways in

**The panel** (`http://localhost:8770`) — the lens as SVG at real geometry, the
same lens as text on the device's own grid, gesture and mic buttons, the phone
page in an iframe, and a live trace of every render, request, event and miniapp
`console.*` line.

**Scripted** — `new Simulator({bundle})` with `tap()`, `speak()`,
`background()`, `emit()`, `lens()`, `lensText()`, `settle()`, `waitForLens()`,
and `sim.phone` as a headless WebView (`open`, `send`, `request`, `waitFor`).
This is what a walkthrough or a regression test uses; no browser needed.

## Deliberate non-goals

- **Font rasterisation.** Glyph widths are exact — they drive wrapping and are
  what the firmware measures with — but the panel draws with a system font
  stretched to the measured width per line. Line breaks are true; letterforms
  are not.
- **BLE.** Frames go straight to the virtual device. Transport loss, pacing, and
  cross-app display arbitration are out of scope.
- **OS permission grants.** Manifest declarations are reported; a denied runtime
  grant is not modelled.

## First use

Tenir (`xerktech/Tenir`) now carries two harnesses built on it:
`veiller/sim/walkthrough.ts` (20 steps over the lens: sign-in, capture, cues,
translation runs, songs, the Continue/Exit menu, reconnect, token expiry,
backgrounding, history, sign-out) and `veiller/sim/phone-tour.ts` (the same
ground on the phone page, through a real browser). Both pass against the current
build and against the published `tenir-veiller-v0.6.4.zip`.
