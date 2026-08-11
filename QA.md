# QA.md

How to get each Veiller component running and attack it. Verified commands only —
if something here fails, fix this file as part of your change.

## Local toolchain (this machine)

- `bun` 1.3.14 at `~/.local/bin/bun`; Node 22; JDK 17 at `~/tools/jdk-17.0.20+8`.
- Android SDK at `~/Android/Sdk`; AVD `turma228` (Pixel 6, x86_64, android-35).
- `adb` needs `export PATH=$HOME/Android/Sdk/platform-tools:$PATH`.
- **CI pins bun 1.2.22** (`.github/workflows/ci.yml`), and a 1.2.22 binary is at
  `~/tools/bun122/bun-linux-x64/bun`. Use it for anything that writes a
  `bun.lock` — see Traps.

## Mobile app (`mobile/`, Expo React Native + expo-router)

### Build and install a debug APK

    cd mobile/android
    ANDROID_HOME=$HOME/Android/Sdk JAVA_HOME=$HOME/tools/jdk-17.0.20+8 \
      ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64 \
      ./gradlew :app:assembleDebug --no-daemon
    adb install -r app/build/outputs/apk/debug/app-debug.apk

- **`ANDROID_HOME` is mandatory.** Without it Gradle fails with "SDK location not
  found" *and still leaves the previous APK in place*, so a plain `adb install -r`
  silently installs a stale build. Always check the APK mtime after building.
- APK is ~220 MB; a warm incremental build is ~35 s, cold ~10 min.
- Application id: `com.xerktech.veiller`; launcher `com.xerktech.veiller/.MainActivity`.
- Debug builds need Metro. `adb reverse tcp:8081 tcp:<metro-port>`.

### First launch

The first launch after an install takes 90–110 s (it extracts a ~263 MB STT
model). Later cold starts are ~45–60 s to a rendered home. Budget for it.

### Driving it

    adb shell am start -n com.xerktech.veiller/.MainActivity                  # cold
    adb shell am start -a android.intent.action.VIEW -d "<url>" com.xerktech.veiller
    adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml
    adb exec-out screencap -p > shot.png
    adb logcat -d | sed 's/.*ReactNativeJS: //'

Useful log markers (all `ReactNativeJS`):
`INDEX: MOUNTED` / `INDEX: init()` / `MANTLE: init()` (boot), `NAV: push()` /
`NAV: replace()` / `NAV: replaceAll()` (navigation), `DEEPLINK:` /
`@@@ MATCHED ROUTE @@@` / `@@@ PARAMS @@@` (deep links), `NOT_FOUND:`,
`PAIRING:`, `APP_REGISTRY:` / `ZIP: unzipping` (miniapp install).

### Deep links

Custom scheme `com.xerktech.veiller://<path>`; the only verified https App Link
is `https://apps.mentraglass.com/package/...` (see the `autoVerify` filter in
`mobile/android/app/src/main/AndroidManifest.xml`) — `/apps/...` over https is
**not** claimed and returns `result code=-91`, by design.

Patterns worth exercising: `://home`, `://settings`, `://glasses`,
`://package/<pkg>`, `://apps/<pkg>`, `://miniapps/settings/<section>`,
`://pairing/<step>` (`guide|prep|bluetooth|btclassic|scan|select-glasses|wifi-setup`),
`://mirror/video/<id>`, and an unknown path (must land on home, not a dead end).

Test each **cold** (force-stop first) *and* **warm** — they take different code
paths and behave differently.

### Screens and how to reach them

- Home bottom bar: left pill = running apps, then an **app-drawer** sheet and the
  **Miniapp Store**. Their order is not labelled; read `content-desc`/`bounds`
  from a uiautomator dump rather than hardcoding coordinates.
- Miniapp info + uninstall: `://package/<packageName>` → "Uninstall" → confirm.
- Settings list: `://settings` (the home "Settings" *tile* is a miniapp launcher
  and does not open this screen).
- Pairing: home → "Pair glasses" → model picker (G2 only, by XERK-206) → prep guide.
- Simulated/no-glasses: home → "Setup without glasses" → "Phone mode" → Start.

### Store install/update paths

The store's own row states are derived by
`mobile/src/services/miniapps/storeRowState.ts` (pure, unit-tested).
To exercise them for real:

- **Install**: uninstall a miniapp, reopen the store, tap Install. Stages show
  "Checking for the latest version…" → "Downloading…" → "Installed vX ✓".
- **Failure/Retry**: open the store online (so the version resolves and Install
  renders), *then* `adb shell cmd connectivity airplane-mode enable`, then tap
  Install. Row shows the error and a **Retry** button. Turn airplane off and
  Retry to recover.
- **Offline**: enable airplane mode *before* entering the store — both rows read
  "Couldn't check for updates" and offer no button.
- **Paused**: toggle a row off — "Updates paused", no button, even when the
  miniapp is not installed.

### Mobile gates

    cd mobile && bun install && bun run compile     # tsc, ~3 min
    cd mobile && bun run test                       # jest, 82 suites / 644 tests, ~2 min

`mobile/jest.config.js` ignores `modules/engine`, `modules/miniapp`,
`modules/jspolyfill`, `services/photo`, `services/streaming` and two bun:test
files. Anything else under `mobile/src/**/*.test.ts(x)` is in the gate.

## SDK, CLI, simulator

    cd mobile/modules/miniapp && bun run build && bun run typecheck && bun test  # 257 tests
    cd mobile/modules/engine  && bun test src/utils/display                      # 11 tests
    cd sdk/miniapp-cli        && bun test                                        # 102 tests
    cd sdk/miniapp-simulator  && bun test                                        # 30 tests
    bun sdk/miniapp-cli/src/index.ts schema print | diff -u sdk/miniapp-cli/schema/miniapp.schema.json -

- `mobile/modules/miniapp/dist` is gitignored and everything else imports it —
  build it first or the CLI/simulator/miniapp builds fail confusingly.
- The full engine suite has pre-existing order-dependent failures
  (`AudioCloudUplink.test.ts`); CI deliberately scopes to `src/utils/display`.
- `bun sdk/...` must be run from the **repo root**; from a subdirectory it fails
  with `Module not found`.

## Miniapps (`miniapps/*`)

    for d in miniapps/*/; do (cd "$d" && bun run build && bun test); done

All 11 build; 9 have test scripts. Typecheck each with
`bun x tsc --noEmit -p tsconfig.json` from the miniapp dir — **except `merge`,
whose tsconfig lives at `miniapps/merge/miniapp/tsconfig.json`**, not its root.

### Driving a miniapp off-hardware (the simulator)

    bun sdk/miniapp-simulator/src/cli.ts ./miniapps/<name> --headless
    bun sdk/miniapp-simulator/src/cli.ts ./miniapps/<name> --scenario s.ts --storage k=v
    bun sdk/miniapp-simulator/src/cli.ts ./miniapps/<name>          # control panel :8770

A scenario file default-exports `(sim: Simulator) => Promise<void>`. You can also
`import {Simulator} from "sdk/miniapp-simulator/src/simulator.ts"` and drive it
from an ordinary bun script — that is the easiest way to stand up local HTTP
fixtures in the same process.

Verbs: `sim.phone.open()/send(ch,p)/request(ch,p)` (the phone WebView bus),
`sim.tap()/buttonPress()/speak()/emit(stream,data)`, `sim.lens()/lensText()`,
`sim.settle()`, `sim.waitForLens()`. `--storage` seeds `session.storage`, e.g.
`--storage 'turma.glasses.config={"hubUrl":"http://127.0.0.1:18801",...}'`
(key `turma.glasses.config`, see `miniapps/turma/src/core/config.ts`).

The simulator loads a miniapp's `dist/`, so **`bun run build` in that miniapp
first** or you are testing yesterday's code.

## Traps that cost time

- **A shared emulator.** Other agent sessions on this host drive `turma228` over
  adb: they launch `com.xerktech.turma` over your app, raise permission dialogs,
  and run `uiautomator` concurrently (which crashes yours with
  "UiAutomationService … already registered"). Always assert the capture is
  yours — `grep 'package="com.xerktech.veiller"' ui.xml` — and re-run when it is
  not. `pm disable-user com.xerktech.turma` does not stick.
  `export ANDROID_SERIAL=emulator-5554` once a second emulator appears.
- **A dev-build warning toast sits over the bottom bar** (`[26,2146][1054,2271]`)
  and swallows taps on the store / app-drawer icons. Dismiss it (tap its ✕ at
  ~`996,2209`) before driving the bottom bar.
- **Gradle silently reuses a stale APK** when the build fails for lack of
  `ANDROID_HOME` (above).
- **Regenerate lockfiles with the bun CI pins, not the one on your PATH.**
  The committed locks are what **bun 1.2.22** produces (there is a copy at
  `~/tools/bun122/bun-linux-x64/bun`); CI pins that version because 1.3.x has a
  resolver regression on `file:` deps. Installing with a local bun 1.3.x will
  dirty the locks — `git checkout` them afterwards unless the drift is your
  change, in which case redo the install with 1.2.22.
- **An unbound localhost port is blackholed on this WSL2 host**, not refused —
  `fetch`/`curl` hang for minutes instead of erroring. To test a network-failure
  path deterministically, use a socket that accepts then `end()`s the connection
  rather than a closed port.
- **The miniapp startup sync reinstalls every *enabled* miniapp on boot**
  (`MantleManager` → `veillerMiniappSync`). Uninstalling one and restarting the
  app puts it back; pause the row first if you need it to stay uninstalled.
- **Captions display-lines used to be validated in two places** — the UI offered
  a range the background then re-checked independently, so a mismatch produced a
  control that silently did nothing. Both halves now read
  `DISPLAY_LINES_OPTIONS` from `miniapps/captions/src/shared/types.ts`; keep it
  that way, and note the cap is 7 (not `G2_PROFILE.maxLines` of 8) because
  8 x 40px overflows the 288px lens and measurably renders 7.
- **Deep-link delivery has three entry points and is easy to break.** A cold
  start delivers the same URL through `+not-found` *and*
  `Linking.getInitialURL()`, and `index.tsx` replays it again after boot. The
  dedup state is a `useRef` and the URL is claimed **at dispatch**, not on
  entry — claiming early marked calls that then bailed out (deferred for boot,
  or superseded) as handled, which swallowed the one call that would have
  navigated. The boot deferral is likewise idempotent: replacing to `/` twice
  remounts the index route and the second instance wipes the first one's
  replay. When touching any of this, count `NAV: push()` per intent and test
  cold *and* warm — the UI alone will not tell you.

## Blast radius

- `mobile/src/contexts/DeeplinkContext.tsx` ↔ `mobile/src/app/index.tsx`
  (pendingRoute replay) ↔ `mobile/src/app/+not-found.tsx` (second entry point).
  A change to any one of the three needs cold **and** warm tests of all of them.
- `mobile/src/app/miniapps/store.tsx` ↔ `services/miniapps/storeRowState.ts` ↔
  `services/miniapps/veillerMiniappSync.ts` ↔ `config/veillerMiniapps.ts`.
- `mobile/modules/miniapp/dist` is consumed by `sdk/miniapp-cli`,
  `sdk/miniapp-simulator` and every `miniapps/*` build.
- `sdk/miniapp-cli/schema/miniapp.schema.json` is generated from the CLI's own
  types and gated by CI — regenerate with
  `bun sdk/miniapp-cli/src/index.ts schema regenerate`.
