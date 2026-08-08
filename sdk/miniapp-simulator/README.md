# @veiller/miniapp-simulator

Run a Veiller miniapp on simulated glasses, with a simulated phone, on your
laptop — see the lens, press the temple bar, feed the mic, and click through the
phone page, without hardware.

```bash
bun sdk/miniapp-simulator/src/cli.ts ./miniapps/captions
# → Control panel: http://localhost:8770
```

## What it actually runs

Not a mock. The simulator is assembled out of the app's own code, so what you
see is what a G2 would show:

| Piece | Where it comes from |
|---|---|
| The background context | The miniapp's **real** built bundle, evaluated in a Worker standing in for the per-miniapp JSContext — same `__dispatch` bridge, same `init` handshake, same pre-rename ABI fallback |
| The wire protocol | `@veiller/miniapp`'s own `MiniappRequestType` / `MiniappResponseType` enums |
| The display pipeline | `processScene` + `diffScene` from `mobile/modules/engine` — the same clamp / budget / pixel-accurate wrap / change-annotation path the phone runs |
| The device | `evenRealitiesG2` capabilities and the `G2_PROFILE` glyph metrics — 576×288, 40px lines, a 6-container text budget |
| The phone page | The miniapp's real UI bundle, served with `buildVeillerUiShim` and the host globals injected |

Everything the simulator does *not* implement answers with `NOT_IMPLEMENTED`
and is listed in the panel, so a gap looks like a gap rather than a success.

## The panel

`http://localhost:8770` shows:

- **the lens**, drawn from the retained device state at real geometry, updating live
- **the same lens as text**, on a grid derived from the device's own line height
  and space width — easy to paste into a bug report
- **gesture buttons** (tap, double tap, swipes), a mic burst, background/foreground
- **the phone page** in an iframe, wired to the background over the real UI bus
- **a trace** of every render, request, event and miniapp `console.*` line
- **live subscriptions and storage**

## Scripting it

For tests and walkthroughs, drive it from code:

```ts
import {Simulator} from "@veiller/miniapp-simulator"

const sim = new Simulator({bundle: "./dist", storage: {"my.token": "abc"}})
await sim.start()

sim.tap()                       // temple bar
sim.speak({ms: 100})            // one 16k s16le mic frame
await sim.waitForLens("listening")
console.log(sim.lens())         // the lens as text

sim.phone.open()                // mount the phone page, headless
await sim.phone.request("login", {username: "me", password: "…"})

await sim.stop()
```

`sim.phone` is a headless stand-in for the WebView: `open`/`close`, `send`,
`request`, `on`, `waitFor`. It drives the same host verbs the browser panel
does, so a scenario needs no browser at all.

Useful reads: `sim.lensText()` (every string on screen), `sim.glasses.lens()`
(the retained elements with their boxes), `sim.host.trace`,
`sim.host.activeSubscriptions()`, `sim.host.storageSnapshot()`,
`sim.host.unimplemented`.

`sim.settle()` waits for the lens to stop changing, which is what you want
before asserting on an app with a repaint ticker.

## CLI

```
veiller-simulate <bundle> [options]

  --model <name>      g2 (default) or g1
  --port <n>          Panel port (default 8770)
  --headless          Boot, print the lens, exit
  --scenario <file>   Import the file and call its default export with the Simulator
  --storage k=v       Seed session.storage (repeatable)
  --verbose           Mirror miniapp console + host traffic to stdout
```

`<bundle>` is a packed `.zip` or a directory holding `miniapp.json`. A source
directory works too — its `dist/` or `build/` output is found automatically, so
`bun run build && veiller-simulate .` is the loop.

## What it deliberately does not do

- **Rasterise the firmware font.** Glyph *widths* are exact (that is what drives
  wrapping and what the firmware measures with), but the panel draws with a
  system font at measured positions. Line breaks are true; letterforms are not.
- **Emulate BLE.** Frames go straight to the virtual device, so it will not
  reproduce transport-level loss, pacing, or display arbitration between apps.
- **Model OS permission grants.** Manifest-declared permissions are reported;
  a denied OS grant is not simulated.

## Known users

- `Tenir/veiller/sim/walkthrough.ts` — a 20-step tour of the Tenir miniapp's
  lens behaviour
- `Tenir/veiller/sim/phone-tour.ts` — the same tour for its phone page, driven
  through a real browser
