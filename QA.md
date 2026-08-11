# QA.md

How to get each Veiller component running and attack it. Verified commands only —
if something here fails, fix this file as part of your change.

## Local toolchain (this machine)

- `bun` 1.3.14 at `~/.local/bin/bun`; Node 22; JDK 17 at `~/tools/jdk-17.0.20+8`.
- Android SDK at `~/Android/Sdk`; AVD `turma228` (Pixel 6, x86_64, android-35).
- `adb` needs `export PATH=$HOME/Android/Sdk/platform-tools:$PATH`.
- **CI pins bun 1.2.22** (`.github/workflows/ci.yml`), and a 1.2.22 binary is at
  `~/tools/bun122/bun-linux-x64/bun`. Run every gate with it — see Traps.

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
- Start Metro on a non-default port when another session owns 8081:
  `cd mobile && nohup bunx expo start --dev-client --port 8082 &`, then
  `adb reverse tcp:8081 tcp:8082`. It is up when
  `curl -s http://127.0.0.1:8082/status` prints `packager-status:running`
  (~30 s). The `libnspr4.so` / "React Native DevTools" error it prints on start
  is harmless — Metro still serves.

### First launch

The first launch after an install takes 90–110 s (it extracts a ~263 MB STT
model). Later cold starts are ~45–75 s to a rendered home. Budget for it.

### Driving it

    adb shell am start -n com.xerktech.veiller/.MainActivity                  # cold
    adb shell am start -a android.intent.action.VIEW -d "<url>" com.xerktech.veiller
    adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml
    adb exec-out screencap -p > shot.png
    adb logcat -d | sed 's/.*ReactNativeJS: //'

Useful log markers (all `ReactNativeJS`):
`INDEX: MOUNTED` / `INDEX: init()` / `MANTLE: init()` (boot), `NAV: push()` /
`NAV: replace()` / `NAV: replaceAll()` / `NAV: goBack()` (navigation),
`DEEPLINK:` / `@@@ MATCHED ROUTE @@@` / `@@@ PARAMS @@@` (deep links),
`NOT_FOUND: ... — plan: <kind>`, `PACKAGE:`, `PAIRING:`,
`APP_REGISTRY:` / `ZIP: unzipping` (miniapp install).

`grep -c 'MANTLE: init()'` is the fastest boot-health assertion there is: 0 means
the app never booted, whatever is on screen.

A healthy home has the **Settings** tile, the **Glasses Mirror** tile, and the
bottom bar — assert the bottom bar with
`grep -c 'Tap an app above to activate it' ui.xml`. A home missing them is the
"crippled home" that means `mantle.init()` never ran.

### Deep links

Custom scheme `com.xerktech.veiller://<path>`; the only verified https App Link
is `https://apps.mentraglass.com/package/...` (see the `autoVerify` filter in
`mobile/android/app/src/main/AndroidManifest.xml`) — `/apps/...` over https is
**not** claimed and returns `result code=-91`, by design.

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

**The deep-link table cannot override a file route, and the two race.** For a
file-route path, expo-router mounts the screen *and* `processUrl` runs for the
same URL. Both then navigate, last write wins, and which one wins is timing.
This is the single most expensive thing to relearn here:

- Removing a pattern from `deepLinkRoutes` does **not** delegate to the file
  route. `processUrl` still runs, matches nothing, and the fallback handler
  fires `replaceAll("/")` ~100 ms later, wiping whatever the file route did.
  Verify with `grep 'No matching route found for URL' logcat` — that line on a
  path you expected to work means the pattern is missing.
- Re-mapping a `/pairing/:step` target does **not** stop expo-router mounting
  `/pairing/<step>.tsx` when that file exists. `/pairing/btclassic` still mounts
  the real (back-trapping) screen and is left in the stack underneath.
- A cold start's pending-route replay goes through `processUrl`, **not** through
  expo-router, so a file route that translates itself is bypassed entirely on
  the replay. Any path needing translation needs a pattern in the table.

Patterns worth exercising: `://home`, `://settings`, `://glasses`, `://welcome`,
`://package/<pkg>`, `://apps/<pkg>`, `://miniapps/store`,
`://miniapps/settings/<section>`,
`://pairing/<step>` (`guide|prep|bluetooth|btclassic|scan|select-glasses|wifi-setup`),
`://mirror/video/<id>`, and an unknown path (must land on home, not a dead end).

Expected shape of a healthy single deep link: `MANTLE: init()` x1,
`NAV: push()` x1, and Back returns to a full home. `MANTLE: init()` x2 plus
`NAV: replaceAll()` means it fell through to the fallback handler and rebooted
into home — correct only for genuinely unknown paths.

On a **warm** `+not-found` path the normal plan is `duplicate` → `goBack()`,
not `dispatch`: the `Linking` listener dispatches before `+not-found` mounts, so
the shim's job is to pop itself. `dispatch` on a warm link is the rare case.
Grep `"plan: '<kind>'"` to see which branch you actually exercised.

### Screens and how to reach them

- Home bottom bar (1080x2400, Pixel 6): running-apps pill ~`348,2190`,
  **Miniapp Store** ~`723,2190`, **app-drawer** sheet ~`933,2190`. Re-read the
  bounds from a dump if the layout changes.
- Miniapp info + uninstall: `://apps/<packageName>` → "Uninstall" → confirm
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

- **Install**: uninstall a miniapp, reopen the store, tap Install. Row goes
  "Not installed / Latest vX / Install" → "Installed vX ✓".
- **Failure/Retry**: open the store online (so the version resolves and Install
  renders), *then* `adb shell cmd connectivity airplane-mode enable`, then tap
  Install. Row shows the error and a **Retry** button. Turn airplane off and
  Retry to recover.
- **Offline**: enable airplane mode *before* entering the store — both rows read
  "Couldn't check for updates" and offer no button.
- **Paused**: toggle a row off (the `android.widget.Switch` at x≈914) —
  "Updates paused", no button, even when the miniapp is not installed.

### Mobile gates

    cd mobile && bun install && bun run compile     # tsc, ~3 min
    cd mobile && bun run test                       # jest, 83 suites / 657 tests, ~2 min

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

All 11 build; 9 have test scripts (captions, example-miniapp, merge, navigation,
recorder, teleprompter, tenir, translation, turma). Typecheck each with
`bun x tsc --noEmit -p tsconfig.json` from the miniapp dir — **except `merge`,
whose tsconfig lives at `miniapps/merge/miniapp/tsconfig.json`**, not its root.

Green baseline for the 9 suites: captions 10, example-miniapp 21, merge 6,
navigation 78, recorder 18, teleprompter 2, tenir 69, translation 11, turma 341.
**Verified identical on bun 1.2.22 (the CI pin) and 1.3.14.** They used to
diverge — `example-miniapp` 15/6 and `navigation` 73/5 under 1.2.22 — because
RTL does not auto-`cleanup()` on bun 1.2.x and `jest.isFakeTimers` /
`jest.advanceTimersByTime` do not exist there. Both were fixed by an explicit
`afterEach(cleanup)` and an injectable clock, so a divergence between the two
bun versions is now a real regression, not a known quirk.

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

**The simulator cannot drive `miniapps/navigation`'s guidance**: it answers
`miniapp_navigation_request_permission` with `NOT_IMPLEMENTED`, so the app boots
to a blank lens and no route can be started. To exercise `AudioGuidanceManager`
for real, instantiate it directly from a bun script run **from inside
`miniapps/navigation`** (so `react`/deps resolve) with the same two-argument
shape production uses (`NavigationController.ts`), which leaves the injectable
clock and scheduler on their real defaults. A priority-30 prompt queued right
after a priority-100 one is deferred by `MIN_AUTOMATIC_PROMPT_GAP_MS` and drains
on a real timer at ~3500 ms — that is the assertion that proves the injection did
not break wall-clock behaviour. Note the manager's default mode is `"off"`: call
`setAvailable(true)` **and** `setMode("full")` or nothing is ever spoken.

### Rendering a miniapp's phone page headlessly

To assert on what the WebView actually shows (button counts, labels) without a
browser, `renderToString` the component. It only resolves from **inside** the
miniapp package, so copy `src/` to scratch and symlink its `node_modules`
rather than importing across an absolute path — otherwise bun fails with
`Cannot find package 'react'`.

## Mutation testing without touching the repo

To prove a gate actually catches a regression, mutate a **scratch copy** and
re-run the gate there. Building one that behaves like the real tree:

    M=<scratch>/mut; mkdir -p $M/mobile
    for f in $(ls -A mobile); do [ "$f" = src ] || ln -s "$PWD/mobile/$f" "$M/mobile/$f"; done
    cp -r mobile/src $M/mobile/src
    for f in $(ls -A .); do [ "$f" = mobile ] || ln -sfn "$PWD/$f" "$M/$f"; done   # src escapes to ../../cloud
    cd $M/mobile && ~/tools/bun122/bun-linux-x64/bun x jest --silent

The sibling symlinks are required: `mobile/src` imports
`@/../../cloud/packages/types/src`, so without a `$M/cloud` the run dies with
33 "Could not locate module" config errors. Even then the scratch harness finds
78 suites (not 83) and 10 unrelated suites fail on timing/native shims, so
**diff the set of failing suites against a baseline run in the same harness**
rather than trusting absolute counts. Same recipe works for a miniapp
(`miniapps/navigation`), where it reproduces 78/78 exactly.

## Traps that cost time

- **A shared emulator.** Other agent sessions on this host drive `turma228` over
  adb: they launch `com.xerktech.turma` over your app, raise permission dialogs,
  and run `uiautomator` concurrently (which crashes yours with
  "UiAutomationService … already registered"). Always assert the capture is
  yours — `grep -c 'package="com.xerktech.veiller"' ui.xml` — and re-run when it
  is not. `pm disable-user com.xerktech.turma` does not stick.
  `export ANDROID_SERIAL=emulator-5554` once a second emulator appears.
- **A dev-build warning toast sits over the bottom bar** (`[26,2146][1054,2271]`)
  and swallows taps on the store / app-drawer icons. Dismiss it (tap its ✕ at
  ~`996,2209`) before driving the bottom bar.
- **The RN LogBox overlay silently eats every tap.** Any `console.error` in a
  debug build (e.g. "Failed to fetch cloud version" on the Connection Error
  screen) raises a full-screen LogBox whose only marks in a dump are a `!` badge
  and content-descs `Dismiss` / `Minimize` (~`270,2274` / `810,2274`). Taps land
  on it, not the app, so buttons look dead and logcat shows nothing. If a tap
  produces zero `ReactNativeJS` output, dump and look for `Dismiss` before
  concluding the control is broken.
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
  start delivers the same URL through `+not-found`, through
  `Linking.getInitialURL()`, *and* through expo-router's own file-route
  resolution; `index.tsx` then replays the pending route after boot. When
  touching any of this, count `NAV: push()` **and** `MANTLE: init()` per intent
  and test cold *and* warm — the UI alone will not tell you.
- **A second `am start` fired within a few seconds of a cold start never reaches
  JS.** Android returns `result code=3` (task-to-front) and delivers no new
  intent, so the URL is dropped before the app sees it. Check
  `grep 'result code=' start.txt` before blaming the deep-link code; warm
  deliveries do not have this problem.
- **`/pairing/scan` is a file route, so a deep link mounts the real scan
  screen** whatever the deep-link table says. `scan.tsx` guards on a missing
  `deviceModel` and `replace()`s to `/pairing/select-glasses-model`; the marker
  is `PAIRING: /pairing/scan opened without a deviceModel`. If that guard is
  ever weakened the symptom returns as "Scanning for " with an empty model plus
  a red `[startScan] Cannot convert 'undefined' to a Kotlin type`. Nothing in
  `mobile/src/__tests__/app/pairing/scan.test.tsx` covers the missing-model
  case — every test sets `deviceModel` — so removing the guard keeps jest green.
- **`/pairing/btclassic` is a one-way screen.** It calls
  `focusEffectPreventBack()` and its header back button is commented out, so
  hardware Back does nothing (verified: 5 presses, still on "Pair Audio"), HOME +
  relaunch returns to it, and its only control is "Open settings". Because it is
  a **file route**, deep-linking `://pairing/btclassic` mounts it no matter what
  the deep-link table maps that step to. Force-stop to escape, and do not use it
  as a warm-link fixture.
- **Only `planDeeplink.ts` is unit tested; the React layer around it is not.**
  A mutation audit confirms `mobile/src/services/deeplink/planDeeplink.test.ts`
  catches a boot guard keyed on the wrong thing, dedup leaking onto the cold
  `initial` delivery, an always-true `shouldResetToHomeBeforeHandoff`, and the
  boot guard being deleted outright. It catches **nothing** in
  `+not-found.tsx`, `package/[packageName].tsx` or `DeeplinkContext.tsx` —
  deleting `+not-found`'s `duplicate` → `goBack()` branch (the branch every warm
  deep link actually takes), deleting the rescue timer's `mantle.isInitialized`
  guard, and flipping the package route's `replace` to `push` all leave jest and
  tsc fully green. Never accept a green suite as evidence that a change to those
  three files works; drive it on a device.
- **`+not-found`'s rescue timer has not been observed to fire.** Across 37
  instrumented deep-link runs the string `NOT_FOUND: nothing navigated away`
  never appeared once: post-boot every plan branch navigates away and unmounts
  the screen before the 20 s timer, and pre-boot the timer returns early on
  `!mantle.isInitialized`. Treat it as unproven safety net, not as cover.
- **A failed boot parks on "Connection Error", and that is recoverable.** With
  airplane mode on, a cold deep link leaves the app on Connection Error with
  Retry / Continue Anyway (not a crippled home, not a spinner). Dismiss the
  LogBox first, then Retry boots the app *and* replays the pending deep link.

## Blast radius

- `mobile/src/services/deeplink/planDeeplink.ts` (pure decision) ↔
  `mobile/src/contexts/DeeplinkContext.tsx` (carries it out, owns the pattern
  table) ↔ `mobile/src/app/index.tsx` (pendingRoute replay) ↔
  `mobile/src/app/+not-found.tsx` (second entry point) ↔ every file route under
  `mobile/src/app/` (the third, silent entry point). A change to any one of
  these needs cold **and** warm tests of all of them, including at least one
  file-route path and one `+not-found` path.
- `mobile/src/app/miniapps/store.tsx` ↔ `services/miniapps/storeRowState.ts` ↔
  `services/miniapps/veillerMiniappSync.ts` ↔ `config/veillerMiniapps.ts`.
- `mobile/modules/miniapp/dist` is consumed by `sdk/miniapp-cli`,
  `sdk/miniapp-simulator` and every `miniapps/*` build.
- `sdk/miniapp-cli/schema/miniapp.schema.json` is generated from the CLI's own
  types and gated by CI — regenerate with
  `bun sdk/miniapp-cli/src/index.ts schema regenerate`.
- `miniapps/turma/src/core/fetch-policy.ts` is the whole security boundary for
  `turma:fetch`; `background/index.ts` must stay a thin shell around it.
- `miniapps/navigation`'s `AudioGuidanceManager` is constructed in
  `background/NavigationController.ts` with two arguments; its clock/scheduler
  parameters exist only for tests, so any caller passing more is a red flag.
