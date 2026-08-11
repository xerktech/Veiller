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
- **JS-only changes need no rebuild** — Metro serves the worktree live. Only
  native/manifest changes require `assembleDebug`.

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

`grep -c 'MANTLE: init()'` is the fastest boot-health assertion there is: 0 means
the app never booted, whatever is on screen.

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

**Two classes of path, and they behave completely differently — split your
matrix along this line or you will test only half of it:**

- Paths with **no** matching file route (`/settings`, `/glasses`, `/welcome`,
  `/apps/<pkg>`, `/pairing/bluetooth`, `/pairing/nonsense`, unknown paths) go
  through `+not-found`, which calls `processUrl` and drives the boot.
- Paths that **do** have a file route under `mobile/src/app/` are rendered by
  expo-router directly and never reach `+not-found`. `ls -R mobile/src/app` is
  the authoritative list; it is longer than it looks and includes **`/home`**
  (`home.tsx`), `/package/[packageName]`, `/miniapps/store`,
  `/miniapps/settings/<section>`, `/applet/{settings,text-editor}`,
  `/onboarding/*`, `/wifi/*`, `/ota/*`, `/mirror/video-player`,
  `/home/background-apps`, `/glasses/nex-developer-settings`, `/test/mini-app`
  and `/pairing/{prep,scan,btclassic,failure,loading,select-glasses-model,
  select-controller,prep-controller,scan-controller,success,unpair-even}`.
- A file-route path whose deep-link handler pushes a *different* route leaves
  the file route's own screen in the stack underneath. `/package/<pkg>` is the
  one that bites: its file route renders nothing at all (every child of
  `mobile/src/app/package/[packageName].tsx` is commented out), so Back from a
  warm `://package/...` or the https App Link lands on a black screen.
- `/miniapps/store` has **no** entry in `DeeplinkContext`'s table, so a deep
  link to it hits the fallback handler, which does `replaceAll("/")` — a full
  index remount and a second `INDEX: init()` / version check. Same for any
  unknown path. Expect `MANTLE: init()` x2 and `INDEX: MOUNTED` x2 there and do
  not read it as a double boot bug; `mantle.init()` itself is idempotent.

### Screens and how to reach them

- Home bottom bar (1080x2400, Pixel 6): running-apps pill ~`348,2190`,
  **Miniapp Store** ~`723,2190`, **app-drawer** sheet ~`933,2190`. Re-read the
  bounds from a dump if the layout changes.
- Miniapp info + uninstall: `://package/<packageName>` → "Uninstall" → confirm
  → "Success" dialog → OK.
- Settings list: `://settings` (the home "Settings" *tile* is a miniapp launcher
  and does not open this screen).
- Pairing: home → "Connect glasses" → model picker (G2 only, by XERK-206) →
  prep → "Continue to pairing" → `/pairing/scan` ("Scanning for Even Realities
  G2"). If "Continue to pairing" silently does nothing, a previously-denied
  Bluetooth permission is raising a "Permission Required" alert: grant them
  first with `adb shell pm grant com.xerktech.veiller
  android.permission.{BLUETOOTH_SCAN,BLUETOOTH_CONNECT,BLUETOOTH_ADVERTISE,RECORD_AUDIO,READ_PHONE_STATE}`.
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
- `bun install` inside `sdk/` runs a lifecycle script that does
  `rm -rf dist && tsc`, so it *rebuilds* the SDK as a side effect. Harmless, but
  it is why an install there takes a while and why `dist` timestamps move.
- The full engine suite has pre-existing order-dependent failures
  (`AudioCloudUplink.test.ts`); CI deliberately scopes to `src/utils/display`.
- `bun sdk/...` must be run from the **repo root**; from a subdirectory it fails
  with `Module not found`.

## Miniapps (`miniapps/*`)

    for d in miniapps/*/; do (cd "$d" && bun run build && bun test); done

All 11 build; 9 have test scripts. Typecheck each with
`bun x tsc --noEmit -p tsconfig.json` from the miniapp dir — **except `merge`,
whose tsconfig lives at `miniapps/merge/miniapp/tsconfig.json`**, not its root.

Green baseline for the 9 suites: captions 10, example-miniapp 21, merge 6,
navigation 78, recorder 18, teleprompter 2, tenir 69, translation 11, turma 341.
**All nine pass** — verified 3x consecutively on a quiet machine.

**Those numbers are bun-version dependent, and CI runs the version that
fails.** With `~/tools/bun122/bun-linux-x64/bun` (1.2.22, the CI pin):
`example-miniapp` is 15 pass / 6 fail and `navigation` is 73 pass / 5 fail,
deterministically, in isolation, 3/3. With bun 1.3.14 on PATH both are green
(21 and 78). Causes:
- `navigation/src/test/audio-guidance.test.ts:56` calls `jest.isFakeTimers()`,
  which 1.2.22 does not implement — `TypeError: jest.isFakeTimers is not a
  function` in `afterEach`.
- `example-miniapp` `CameraPage.test.tsx` renders accumulate across tests under
  1.2.22, so `getByLabelText("mode")` hits "Found multiple elements".
Always reproduce a miniapp suite result with the 1.2.22 binary before deciding
whether CI is green. An earlier version of this file blamed the host; it was
wrong.

`miniapps/navigation`'s build prints `WARN: No public Mapbox token is set` — it
is a warning, not a build failure.

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

`sim.host.storageSnapshot()` returns everything the background persisted — feed
it to a second `new Simulator({storage: ...})` to test that a setting survives a
restart without touching a device.

The simulator loads a miniapp's `dist/`, so **`bun run build` in that miniapp
first** or you are testing yesterday's code.

### Rendering a miniapp's phone page headlessly

To assert on what the WebView actually shows (button counts, labels) without a
browser, `renderToString` the component. It only resolves from **inside** the
miniapp package, so copy `src/` to scratch and symlink its `node_modules`
rather than importing across an absolute path — otherwise bun fails with
`Cannot find package 'react'`.

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
  change, in which case redo the install with 1.2.22. There are three roots that
  own a lock: repo root, `mobile/`, `sdk/`.
- **An unbound localhost port is blackholed on this WSL2 host**, not refused —
  `fetch`/`curl` hang for minutes instead of erroring. To test a network-failure
  path deterministically, use a socket that accepts then `end()`s the connection
  rather than a closed port; for a *timeout* path use one that accepts and never
  writes.
- **The miniapp startup sync reinstalls every *enabled* miniapp on boot**
  (`MantleManager` → `veillerMiniappSync`). Uninstalling one and restarting the
  app puts it back; pause the row first if you need it to stay uninstalled.
- **Captions display-lines used to be validated in two places** — the UI offered
  a range the background then re-checked independently, so a mismatch produced a
  control that silently did nothing. Both halves now read
  `DISPLAY_LINES_OPTIONS` from `miniapps/captions/src/shared/types.ts`; keep it
  that way, and note the cap is 7 (not `G2_PROFILE.maxLines` of 8) because
  8 x 40px overflows the 288px lens and measurably renders 7.
- **Captions validates `displayLines` on both edges now** — `setDisplayLines`
  and `loadSettings` both run `isSupportedDisplayLines`, so a seeded or stale
  storage value outside 2–7 loads as the default 3. Nothing in the captions
  suite covers that (removing the `loadSettings` check leaves 10/10 green), so
  verify it in the simulator, not by reading the tests.
- **Deep-link delivery has three entry points and is easy to break.** A cold
  start delivers the same URL through `+not-found` *and*
  `Linking.getInitialURL()`, and `index.tsx` replays it again after boot. The
  dedup state is a `useRef` and the URL is claimed **at dispatch**, not on
  entry — claiming early marked calls that then bailed out (deferred for boot,
  or superseded) as handled, which swallowed the one call that would have
  navigated. When touching any of this, count `NAV: push()` **and**
  `MANTLE: init()` per intent and test cold *and* warm — the UI alone will not
  tell you.
- **The boot deferral's idempotence guard and the `initial` branch both write
  `pendingRoute`.** `processUrl(url, initial=true)` sets the pending route
  itself before the `mantle.isInitialized` check, so a guard of the form
  `if (getPendingRoute() === url) return` sees its *own* write and skips the
  `nav.replace("/")` that would have booted the app. That is invisible for
  `+not-found` paths (something else already did the replace) and fatal for
  file-route paths, which have no other entry point — the app renders the file
  route with no runtime behind it and never boots. Always include a file-route
  path in a cold deep-link matrix.
- **`+not-found`'s 15 s rescue timer does fire now** (its deps are a serialised
  `query` string and `pathname`, not the fresh objects that used to cancel it).
  To make it fire, keep `mantle.init()` from completing for >15 s and deliver
  the same URL twice: `adb shell cmd connectivity airplane-mode enable`, then a
  cold deep link — the boot version check fails, the app parks on "Connection
  Error", and a second delivery of the same URL takes the
  `DEEPLINK: boot already pending` early return, so nothing navigates.
  Watch for `NOT_FOUND: nothing navigated away`.
- **`+not-found` calls `clearHistoryAndGoHome()` on the booted path before it
  hands off to `processUrl`.** If `processUrl` then declines to navigate — most
  easily by hitting the 3 s dedup window — the target screen is wiped and never
  re-pushed, and the user lands on home. Fire the *same* warm link twice 1 s
  apart to see it. Count `NAV: push()` **and** check the screen: one push with
  the wrong screen showing is the failure mode.
- **`/pairing/scan` is a file route, so a deep link mounts the real scan
  screen** whatever the deep-link table says. `scan.tsx` now guards on a missing
  `deviceModel` and `replace()`s to `/pairing/select-glasses-model`; the marker
  is `PAIRING: /pairing/scan opened without a deviceModel`. If that guard is
  ever weakened the symptom returns as "Scanning for " with an empty model plus
  a red `[startScan] Cannot convert 'undefined' to a Kotlin type`. Nothing in
  `mobile/src/__tests__/app/pairing/scan.test.tsx` covers the missing-model
  case — every test sets `deviceModel` — so removing the guard keeps jest green.
- **`/pairing/btclassic` (and `/pairing/bluetooth`, which maps to it) is a
  one-way screen.** It calls `focusEffectPreventBack()` and its header back
  button is commented out, so hardware Back does nothing, HOME + relaunch
  returns to it, and its only control is "Open settings". Reaching it by deep
  link traps the app until a force-stop. Do not use it as a warm-link fixture
  unless you are prepared to force-stop afterwards.
- **Nothing under `mobile/**` tests `DeeplinkContext.tsx` or `+not-found.tsx`.**
  Reverting the boot-deferral guard, the `+not-found` history clear, the
  `/pairing/scan` guard, the captions load validation or the turma hub-URL
  try/catch all leave every suite green. Deep-link behaviour is only ever
  verified on a device — budget for that, and never accept a green suite as
  evidence a deep-link change works.

## Blast radius

- `mobile/src/contexts/DeeplinkContext.tsx` ↔ `mobile/src/app/index.tsx`
  (pendingRoute replay) ↔ `mobile/src/app/+not-found.tsx` (second entry point)
  ↔ every file route under `mobile/src/app/` (the third, silent entry point).
  A change to any one of these needs cold **and** warm tests of all of them.
- `mobile/src/app/miniapps/store.tsx` ↔ `services/miniapps/storeRowState.ts` ↔
  `services/miniapps/veillerMiniappSync.ts` ↔ `config/veillerMiniapps.ts`.
- `mobile/modules/miniapp/dist` is consumed by `sdk/miniapp-cli`,
  `sdk/miniapp-simulator` and every `miniapps/*` build.
- `sdk/miniapp-cli/schema/miniapp.schema.json` is generated from the CLI's own
  types and gated by CI — regenerate with
  `bun sdk/miniapp-cli/src/index.ts schema regenerate`.
- `miniapps/turma/src/core/fetch-policy.ts` is the whole security boundary for
  `turma:fetch`; `background/index.ts` must stay a thin shell around it.
