# Tap Typing Demo

Minimum-viable proof of one thing, end to end:

> Tap Strap 2 and Even Realities G2 are both connected to an Android phone over
> Bluetooth. The phone's screen is off and in a pocket. The user types with
> standard Tap finger chords. Letters appear in a text box on the G2 display in
> real time.

If it types and it echoes, the demo succeeded. Everything else (mouse support,
custom fonts, chord remapping, iOS, persistence, backends) is deliberately out
of scope.

## How it works

```
Tap Strap 2 ──BLE GATT (Controller Mode)──▶ TapInputService (Kotlin FGS)
                                                │  tap-android-sdk callback,
                                                │  tapcode → char via TapAlphabet
                                                ▼
                                    TapInputModule (Expo module)
                                                │  sendEvent("tap_input")
                                                ▼
                                 engine DeviceEventRouter (RN)
                                                │  forwardEvent("tap_input")
                                                ▼
                              this miniapp (background JSContext)
                                                │  buffer + 90ms coalesced
                                                │  session.display.render
                                                ▼
                            G2 native driver (EvenHub queue) ──BLE──▶ glasses
```

Key decisions (do not re-litigate mid-build):

- **Controller Mode, not Bluetooth HID.** Android routes HID key events to the
  focused window; screen-off-in-pocket has no focused window. The
  tap-android-sdk gives the app a direct GATT connection and raw 5-bit finger
  chords (tapcodes) regardless of screen state.
- **The letter mapping is ours.** In Controller Mode the firmware's text-mode
  mapping is bypassed; `TapAlphabet.kt` transcribes the official published Tap
  alphabet (sources in the file header), unit-tested in `TapAlphabetTest.kt`.
- **On-device miniapp SDK, not the Cloud SDK.** No server round-trip in the
  echo path.

## Running it

1. Build and install the Foverlay app (`cd mobile && bun install && bun android`).
2. Pair the Tap Strap 2 in **Android Bluetooth settings** (the SDK attaches to
   bonded devices; it does not pair). Pair the G2 through the app as usual.
3. Start this miniapp:
   ```bash
   cd miniapps/tap-typing-demo
   bun install
   bun run dev        # prints a QR; scan it via Settings → Developer settings
   ```
4. "Tap Typing Demo ready" appears on the G2. Type.

The TapInputService foreground service starts automatically with the app
(persistent "Tap input active" notification) and survives screen-off/Doze.

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
in daylight. The demo is not "working" until it has run on both real devices.

## Latency (milestone 7 — the real deliverable)

Every coalesced render logs:

```
[tap-typing] latency keystroke->display-call 96ms (2 chord(s) coalesced)
```

measured from the native SDK callback timestamp to the `session.display.render`
call. The G2 BLE write leg (native EvenHub queue → glass) adds on top; correlate
with the driver's `BGCAP:` logs for the full picture. Budget: if the round trip
exceeds ~120ms it will feel broken.

**Measured:** _not yet measured on real hardware — record numbers here once
milestone 5+ passes (real Tap connected)._

## Definition of done

- [ ] Phone screen off, in pocket, both devices connected over BLE
- [ ] Typing standard Tap chords produces correct letters on the G2
- [ ] Backspace works
- [ ] Survives 5 minutes of idle without disconnect
- [ ] Recovers automatically from a Tap disconnect/reconnect
- [ ] Measured keystroke-to-display latency documented here
