# Tap Strap 2 → G2 Text Echo — build notes

Proves one thing end to end: Tap Strap 2 and Even Realities G2 both connected
to the phone over BLE, phone screen off and in a pocket, the user types Tap
finger chords, letters appear in a text box on the G2 in real time. If it
types and it echoes, the demo succeeded.

Originally built (2026-08-02) against a demo spec as a miniapp; on 2026-08-03
Foverlay pivoted to a **dedicated app** (no miniapp platform), so the echo now
lives entirely in the host. This doc records the architecture, the deviations
from the original spec forced by reading the real upstream code, and the
verification state.

## Architecture

```
Tap Strap 2 ──BLE GATT (Controller Mode)──▶ TapInputService (Kotlin FGS)
                                                │  tap-android-sdk callback,
                                                │  tapcode → char via TapAlphabet
                                                ▼
                                    TapInputModule (Expo module)
                                                │  sendEvent("tap_input")
                                                ▼
                       TapTypingEchoService (@mentra/engine, host service)
                                                │  buffer + 90ms coalesced,
                                                │  trailing 5-line window + cursor
                                                ▼
                LocalDisplayManager.request("system.tap-echo", {view:"main", scene})
                                                ▼
                            G2 native driver (EvenHub queue) ──BLE──▶ glasses
```

Key decisions:

- **Controller Mode, not Bluetooth HID.** Android routes HID key events to the
  focused window; screen-off-in-pocket has no focused window. tap-android-sdk
  gives the app a direct GATT connection and raw 5-bit finger chords
  (tapcodes) regardless of screen state. The SDK's default "flip back to Text
  Mode on app background" behavior is disabled (`disablePauseResumeHandling`).
- **The letter mapping is ours.** In Controller Mode the firmware's text-mode
  mapping is bypassed; `TapAlphabet.kt` transcribes the official published Tap
  alphabet (sources in the file header), unit-tested in `TapAlphabetTest.kt`.
- **Host feature, not a miniapp.** The echo is
  `mobile/modules/engine/src/services/TapTypingEchoService.ts`, started from
  `engine.start()`. It renders through `LocalDisplayManager.request()` with
  the reserved packageName `system.tap-echo` (same convention as
  `system.boot`/`system.clear`) so boot-window queueing, the single native
  scene slot, and reconnect replay stay coherent. Host code must NOT call
  `SceneRenderer.emitScene`/`BluetoothSdk.displayEvent` directly.

## Running it

1. Build and install (`cd mobile && bun install && bun android` — bun 1.2.x),
   or grab the `foverlay-release-apk` artifact from the Android APK workflow.
2. Pair the Tap Strap 2 in **Android Bluetooth settings** (the SDK attaches to
   bonded devices; it does not pair). Pair the G2 through the app as usual.
3. That's it — the echo service starts with the app. "Tap Typing Demo ready"
   appears on the G2 once glasses are connected; type.

The TapInputService foreground service starts automatically (persistent "Tap
input active" notification) and survives screen-off/Doze.

## Developing without the hardware (FakeTapSource)

The native service always listens for adb broadcasts, so the whole chain below
the Tap SDK callback is exercisable with no strap in hand:

```bash
# one chord by raw tapcode (3 = thumb+index = 'n')
adb shell am broadcast -a com.foverlay.tapinput.FAKE_TAP --ei tapcode 3

# one character
adb shell am broadcast -a com.foverlay.tapinput.FAKE_TAP --es char x

# backspace
adb shell am broadcast -a com.foverlay.tapinput.FAKE_TAP --es char '\b'

# stream text at a typing pace (exercises the render throttle)
adb shell am broadcast -a com.foverlay.tapinput.FAKE_TAP --es text 'the quick brown fox' --ei wpm 40
```

What emulation cannot tell you: BLE throughput/pacing with three concurrent
GATT links (Tap + both G2 arms), real typing latency, and waveguide legibility
in daylight. Not "working" until it has run on both real devices.

## Latency (the real deliverable)

Every coalesced render logs:

```
TapTypingEcho: latency keystroke->display-call 96ms (2 chord(s) coalesced)
```

measured from the native SDK callback timestamp to the display request. The
G2 BLE write leg (native EvenHub queue) adds on top; correlate with the
driver's `BGCAP:` logs for the full picture. Budget: if the round trip
exceeds ~120ms it will feel broken.

**Measured:** _not yet measured on real hardware — record numbers here once a
real Tap is connected._

## Definition of done

- [ ] Phone screen off, in pocket, both devices connected over BLE
- [ ] Typing standard Tap chords produces correct letters on the G2
- [ ] Backspace works
- [ ] Survives 5 minutes of idle without disconnect
- [ ] Recovers automatically from a Tap disconnect/reconnect
- [ ] Measured keystroke-to-display latency documented here

## Spec deviations (each forced by reading the real code)

1. **Base branch: `dev`, not `mentra-miniapp-sdk`.** That branch is stale
   (last commit 2026-05-01, ~4,500 commits behind dev); the miniapp SDK merged
   into `dev` long ago. Moot since the pivot to a host feature, but `dev` is
   upstream's default and our base either way.

2. **`showTextWall` no longer exists.** Display is the scene API — one
   full-canvas `{type:"text", id, box, text}` element with a stable id so
   successive renders update in place.

3. **tap-android-sdk ships on Maven Central, not JitPack.**
   `io.github.tapwithus:tap-android-sdk:0.3.6` (verified against
   repo1.maven.org metadata; the JitPack coordinates end at a *failed* 0.3.3
   build). The 0.3.6 AAR's API was verified with `javap` before writing
   `RealTapSource` (`TapListener` has 14 callbacks incl.
   `onTapInputReceived(String, int, int)` — tapIdentifier, tapcode,
   repeatData).

4. **Both TapSources run concurrently instead of a build flag.**
   `TapInputService` always registers the adb-broadcast receiver and starts
   the SDK source only when BLUETOOTH_CONNECT is granted. Fake emits nothing
   unless driven; real emits nothing without a bonded Tap. No rebuild needed
   when hardware arrives.

5. **The mapping includes double/triple-taps.** The SDK reports `repeatData`
   (1/2/3); the official alphabet assigns meanings (J/Q/V/W/Z shortcuts,
   punctuation, @ and _). Unit tests pin the published cross-check examples
   (vowels = single fingers, N/T/L/S pairs, the word INTO, Space=31,
   Backspace=14).

6. **The render throttle is mostly redundant** — upstream deliberately moved
   pacing + last-wins coalescing into the native G2 EvenHub queue (~6-8ms per
   BLE packet). The 90ms coalescer only avoids one JS→native call per
   keystroke. Trailing-window clipping is done in the service because the
   shared TextWrapper clips from the top (oldest lines win — wrong direction
   for a typing echo). G2 fits ~7 lines (288px canvas / 40px calibrated line
   height); the echo shows the last 5.

## Upstream answers found by reading code

- **Bitmaps on G2:** yes — `canDisplayBitmap: true`; the driver tiles images
  into 4-bit grayscale BMPs (`G2.kt displayBitmap/drawLayoutBitmap`). A future
  custom-font renderer can ship `{type:"image"}` scene elements.
- **G2 BLE lifecycle:** `G2.kt` (SGCManager subclass) owns dual GATT
  connections (one per temple arm) with its own reconnection manager, kept
  alive by the MentraOS `ForegroundService` (notification id 1001).
  `TapInputService` is a separate FGS (id 2001) in our own additive module —
  zero contact with the G2 driver; contention risk is radio-level only, which
  is why Tap connect/disconnect transitions are logged from day one.
- **G2 dashboard:** firmware-native (`hasNativeDashboard: true`) — there is no
  JS-composed always-on surface to model against; the in-JS precedent for a
  host-owned frame is the `system.boot` message, which is the convention the
  echo follows.

## Verification state (2026-08-03, no Tap hardware in hand)

- `TapAlphabet` — 12 JUnit tests pass (plain JVM + gradle `testDebugUnitTest`).
- `mobile/modules/tap-input` — compiles in the real prebuild
  (`:foverlay-tap-input:compileDebugKotlin` BUILD SUCCESSFUL, autolinked).
- `mobile` — full `tsc --noEmit` clean with the echo service + strip changes;
  engine bun tests unchanged vs upstream baseline (32 pre-existing failures).
- Full `assembleRelease` builds locally and in CI with zero secrets (Mapbox
  removed).
- Open: milestones needing the physical Tap (real chords, screen-off
  end-to-end, latency numbers), and the fake-tap → G2 display path on a real
  device.
