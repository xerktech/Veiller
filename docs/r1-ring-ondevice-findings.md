# R1 Ring — On-Device Findings & RE Handoff (2026-06-25)

Status of the make-or-break (ring control of the G2). This picks up after the
fork was built and running on a real phone (Samsung Galaxy S25 Ultra, Android 16).
Companion to `docs/r1-ring-research.md` and `docs/r1-ring-capture-findings.md`.

## TL;DR

**The fork builds, installs (`com.xerktech.foverlay`), and runs; the G2 glasses work
fully; the R1 ring connects to the phone and streams data — but ring *gesture
control is not working yet*, and it's the same original-RE problem we started
with, now precisely localized.** Not a wall: the ring talks to the phone. What's
missing is decoding the ring's real gesture packet format and fixing `R1.kt`'s
decoder + connection persistence.

## What works

- **Foverlay fork runs on the S25.** Home screen, navigation, settings all render.
- **G2 glasses**: pair, connect, battery, and the **temple touchpad** emits
  `touch_event`s (`single_tap`/`double_tap`/`swipe_up`/`swipe_down`, tagged
  `deviceModel:"Even Realities G2"`, `source:1`). Inherited MentraOS stack is solid.
- **R1 ring connects to the phone** via `R1.kt`: `connectById → Connecting →
  Connected`, discovers chars incl. `bae80013 [notify]`, `Notify enabled on
  bae80013`, reads `Battery: 64%`, reaches `State: ready`.
- After our glasses-MAC fix (below): `R1: advStart sent` succeeds (binds the ring to
  the glasses), the ring **stays connected ~60s** (was ~4s), and it **streams
  notifications to the phone**: `R1: 9d1f -> 00 09 61 00 05 .. .. .. 0A 09` (the
  `9d1f` suffix = bae80011/bae80013).

## What does NOT work (the remaining make-or-break)

1. **Ring gestures don't surface as usable events.** Isolation test (ring-only
   gestures, *glasses untouched*) produced **zero** `touch_event`s and zero ring
   notifications → the earlier `source:1` events were the **G2 temple**, not the
   ring. The glasses do **not** forward ring gestures to the phone as `touch_event`s.
2. **`R1.kt`'s gesture decoder doesn't match this ring's firmware.** It expects
   notification bytes `[0xFF, type, param]` (0x03=hold, 0x04+param=tap, 0x05+thr=
   swipe). The ring actually sends `00 09 61 ..` on its notify char — a different,
   continuous, sensor/IMU-looking stream. So gestures aren't decoded.
3. **Connection isn't persistent.** Ring drops after ~60s and does NOT auto-reconnect
   (`R1.kt` `deviceSearchId` resets to `NOT_SET` on app launch; only a manual
   re-select via the pairing UI triggers a connect).

## The RE that remains (next session)

1. **Keep the ring connected** long enough to test (fix/extend the connection; avoid
   the ~60s drop), or work within the window.
2. **Decode the ring's gesture format.** With the ring connected, perform ONE known
   gesture at a time (tap, double-tap, hold, slide-up, slide-down) and capture/
   correlate the `9d1f` (bae80011 / bae80013) notifications. Determine whether the
   discrete gestures appear there at all, or only on the ring↔glasses link. If they
   appear, decode tap/slide bytes and **fix `R1.kt`'s gesture parser** (controllers/
   R1.kt — the `R1Gesture.from([0xFF,...])` path).
3. **If gestures only go ring→glasses:** investigate whether the G2 can be made to
   forward them (G2 input events), or treat ring as health-only and re-scope.
4. **Persist the paired ring** (deviceSearchId / ring id) so it auto-reconnects on
   launch instead of needing a manual re-select.

### Clean-run recipe that got furthest

Phone Bluetooth **off then on** (clears stale GATT) → let the **G2 reconnect** (this
stores the left-lens MAC, needed for advStart) → **Settings → G2 → Pair ring → Even
Realities R1 → Continue → tap the ring on the scan screen** → ring on finger.

## Code changes in this fork (why each exists)

- `mobile/app.config.ts` — rebrand default variant to `appName "Foverlay"`, package
  `com.xerktech.foverlay`, `includeFirebase:false` (no google-services), kept
  `scheme:"com.mentra"`. Lets it install alongside the real MentraOS + drop the
  Mentra trademark (CLAUDE.md). NOTE: a clean `expo prebuild` is needed for the
  package to fully propagate; on a reused `android/`, also remove the stale
  `apply plugin: 'com.google.gms.google-services'` from `android/app/build.gradle`
  and the stale `com.mentra.mentra.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` from the
  generated AndroidManifest (else INSTALL_FAILED_DUPLICATE_PERMISSION vs MentraOS).
- `mobile/modules/bluetooth-sdk/.../sgcs/G2.kt` — **the glasses-MAC fix**: store the
  LEFT-lens BLE address into `DeviceStore("glasses","bluetoothMacAddress")` on
  connect (was only set in the scan callback, which doesn't run on reconnect-by-
  address → `R1.kt` logged "no glasses MAC" and dropped the ring).
- `mobile/modules/bluetooth-sdk/.../lc3Lib/build.gradle` — add
  `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON` so `liblc3` is 16KB-page-aligned (S25 /
  Android 16 uses 16KB pages; NDK 27 defaults to 4KB). `libcoder`/`libquickjs` are
  still 4KB but aren't loaded at startup. (NDK r28 is installed if a full 16KB
  rebuild is ever wanted; quickjs-kt 1.0.5 is 16KB but needs Kotlin 2.2+.)
- `mobile/modules/crust/.../navigation/NavigationManager.kt` — replaced with a no-op
  stub (keeps the public API; `CrustModule.kt` compiles unchanged) to remove the
  Mapbox Navigation SDK (gated behind a paid token; nav is out of scope — Google
  Maps notification-mirror planned instead). Original in `upstream`.
- `mobile/modules/crust/android/build.gradle` — removed the two
  `com.mapbox.navigationcore:` deps (paired with the stub above).
- `mobile/src/app/miniapps/settings/glasses.tsx` — un-gated the "Pair ring" button
  (was behind `superMode`) so the ring controller can be paired in a dev build.

## Build / run (dev environment = WSL2, NOT native Windows)

Fork lives at `~/code/Foverlay` in WSL2 Ubuntu (ext4). `source ~/.foverlay-env`.
- `cd mobile && bun install` (mobile is NOT a root workspace — install separately).
- Build the local @mentra module JS (else Metro 500s): `cd modules/<m> && bun run build`
  for bluetooth-sdk (+`build:plugin`), crust, miniapp, types. (`auth`/`island` had TS
  build errors but don't block startup.)
- `cd mobile && bun expo prebuild --platform android` → `android/` (never `--clean`
  unless intended; android/ is gitignored/generated).
- `cd android && ./gradlew :app:assembleDebug` (set
  `ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a`).
- Install + run on the S25 over **wireless ADB** (WSL can't see USB): `adb pair` /
  `adb connect`, `adb reverse tcp:8081`, `bun start` (Metro), `adb install -r`,
  `adb shell am start -n com.xerktech.foverlay/.MainActivity`. Keep the screen awake or the
  debug app gets killed.
- `react-native-skia` needs its postinstall:
  `node node_modules/@shopify/react-native-skia/scripts/install-skia.mjs`.
- our python-extracted bun lacks `bunx`: `ln -sf ~/.bun/bin/bun ~/.bun/bin/bunx`.
