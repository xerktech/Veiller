# Tap Strap 2 → G2 Text Echo Demo — build notes

Companion to `miniapps/tap-typing-demo/README.md` (how to run it). This doc
records what the build spec's open questions resolved to when read against the
actual upstream code, and where the implementation deviates from the spec and
why. Written 2026-08-02 against upstream `dev` (86e32667fa).

## Spec deviations (each forced by reading the real code)

1. **Base branch: `dev`, not `mentra-miniapp-sdk`.** The spec said to build on
   the `mentra-miniapp-sdk` branch. That branch is stale (last commit
   2026-05-01, ~4,500 commits behind dev, 1 unique commit) — the miniapp SDK
   merged into `dev` long ago (`mobile/modules/miniapp` = `@mentra/miniapp`,
   `sdk/miniapp-cli`, `miniapps/*`). `dev` is upstream's default branch and
   satisfies the spec's actual intent: on-device miniapp, no cloud round-trip.

2. **`showTextWall` no longer exists.** The miniapp SDK removed the legacy
   layout API; text is rendered with the scene API —
   `session.display.render([{type:"text", id, box, text}])` with a stable
   element id so successive renders update in place (no flicker). Same pattern
   the captions miniapp uses (`CaptionsController.showTextWall()` helper).

3. **tap-android-sdk ships on Maven Central, not JitPack.**
   `io.github.tapwithus:tap-android-sdk:0.3.6` (verified against
   repo1.maven.org metadata). The JitPack `com.github.TapWithUs` coordinates
   end at a *failed* 0.3.3 build — do not use them. API surface of the 0.3.6
   AAR was verified with `javap` before writing `RealTapSource`
   (`TapListener` has 14 callbacks incl. `onTapInputReceived(String,int,int)`
   — tapIdentifier, tapcode, repeatData).

4. **Both TapSources run concurrently instead of a build flag.** The spec
   suggested selecting Real vs Fake via build flag. Simpler and strictly more
   useful: `TapInputService` always registers the adb-broadcast receiver
   (FakeTapSource) and starts the SDK source only when BLUETOOTH_CONNECT is
   granted. Fake emits nothing unless driven; real emits nothing without a
   bonded Tap. No rebuild needed when hardware arrives.

5. **Tapcode→letter mapping had to include double/triple-taps.** In Controller
   Mode the SDK reports `repeatData` (1/2/3); the official alphabet assigns
   meanings to double-taps (J/Q/V/W/Z shortcuts, punctuation) and triple-taps
   (@, _). `TapAlphabet.kt` transcribes the official Tap Alphabet Glossary PDF
   (sources in the file header); unit tests pin the published cross-check
   examples (vowels = single fingers, N/T/L/S pairs, the word INTO, Space=31,
   Backspace=14).

## Answers to the spec's §7 "resolve by reading code" questions

**Q: What is the exact native→miniapp event mechanism?**
Native Kotlin Expo module `sendEvent("tap_input", map)` →
`@mentra/engine/src/services/DeviceEventRouter.ts` listener →
`localMiniappRuntime.forwardEvent("tap_input", event)` (subscriber-gated
no-op when nothing listens) → per-app envelope over the Crust dispatch bridge
into the miniapp's background JSContext → `EventManager._forwardEvent` →
`session.input.onTapInput(...)` (typed addition mirroring `onButtonPress`).
Note: events land in the **background JSContext** (QuickJS/JSC), not the UI
WebView — transcription works the same way. Subscription is by stream name;
`tap_input` requires no manifest permission (`permissionForStream` returns
null for it).

**Q: Does the G2 driver expose bitmap display?**
Yes. `canDisplayBitmap: true` (`engine/src/types/capabilities/even-realities-g2.ts`);
the driver tiles images into 4-bit grayscale BMPs with a separate image
container pool (`G2.kt displayBitmap/drawLayoutBitmap`). So a future custom
font renderer is possible via `{type:"image"}` scene elements — closer to the
"5 days" end of the spec's estimate, since the plumbing already exists.

**Q: How does upstream manage the G2 BLE lifecycle, and where can
TapInputService sit?**
`G2.kt` (SGCManager subclass) owns dual GATT connections (one per temple arm)
with its own reconnection manager, kept alive by
`com.mentra.bluetoothsdk.services.ForegroundService` (connectedDevice type,
START_STICKY). `TapInputService` is a **separate** foreground service
(notification id 2001 vs upstream's 1001) in our own additive Expo module
`mobile/modules/tap-input` — zero contact with the G2 driver. The contention
risk is at the BLE radio level (3 concurrent GATT links), not in code;
connect/disconnect logging on the Tap side is in from day one per the spec.

**Q: Is the miniapp-side display throttle redundant?**
Mostly. The JS-side ~300ms throttle was deliberately *removed* from
`LocalDisplayManager` (its header explains why: JS timers freeze when iOS
backgrounds); pacing + last-wins coalescing live in the native G2 EvenHub
queue (~6-8ms per BLE packet pacing, conflated rebuilds). The demo keeps a
light 90ms coalescer anyway to avoid one JS→native render call per keystroke,
plus skip-if-unchanged. Trailing-window clipping is done in the miniapp
because the host's TextWrapper clips from the top (oldest lines win — wrong
direction for a typing echo). G2 fits ~7 lines (288px canvas / 40px calibrated
line height); the demo shows the last 5.

## Verification status (2026-08-02, no Tap hardware in hand)

- `TapAlphabet` — 12 JUnit tests pass (plain JVM).
- `@mentra/miniapp` SDK — typecheck + all 256 bun tests pass with the
  `tap_input` additions.
- `tap-typing-demo` — bundles (bun IIFE background build) and typechecks.
- `mobile` — full `tsc --noEmit` passes with the engine/router changes.
- Engine bun tests: 318 pass / 32 fail — the 32 failures are pre-existing on
  unmodified upstream in this environment (LocalDisplayManager timer tests),
  verified by running them on a pristine tree.
- Android native compile of the tap-input module: attempted via
  `expo prebuild` + gradle in this (non-Android-studio) environment — see PR
  notes for outcome.
- Milestones 5–7 (real chords, screen-off end-to-end, latency numbers)
  require the physical Tap Strap 2 + G2 and remain open.
