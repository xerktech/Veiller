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
  expo-router directly and never reach `+not-found`. Today those are
  `/package/[packageName]`, `/miniapps/settings/<section>`, `/miniapps/store`,
  and `/pairing/{prep,scan,btclassic,failure,loading,select-glasses-model,
  success,unpair-even}`. `ls mobile/src/app/**` is the authoritative list.

### Screens and how to reach them

- Home bottom bar (1080x2400, Pixel 6): running-apps pill ~`348,2190`,
  **Miniapp Store** ~`723,2190`, **app-drawer** sheet ~`933,2190`. Re-read the
  bounds from a dump if the layout changes.
- Miniapp info + uninstall: `://package/<packageName>` → "Uninstall" → confirm
  → "Success" dialog → OK.
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

If `example-miniapp` (`CameraPage`) or `navigation` (`AudioGuidanceManager`)
come back red, suspect your environment before your change: both were observed
failing during a pass where another agent session was driving the same host, and
both are green in isolation. Re-run them alone before attributing the failure.

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
- **`CaptionsController.loadSettings()` does not revalidate `displayLines`** the
  way it revalidates `captionTimeoutSeconds` — any integer already in storage is
  accepted on boot. Only `setDisplayLines` enforces `DISPLAY_LINES_OPTIONS`.
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
- **`+not-found` stays in the stack under a pushed deep-link screen**, so Back
  from a warm deep link lands on its bare spinner; a second Back reaches home.
  Its 15 s rescue timer does not save this: the effect's deps include
  `useGlobalSearchParams()` and the context's `processUrl`, both of which get a
  new identity every render, so the cleanup clears the timer and the
  `handled.current` early-return never re-arms it. Treat the rescue as dead code
  until that is fixed — do not assume it covers a strand.
- **`/pairing/scan` exists as a file route**, so a deep link to it mounts the
  real scan screen and fires the native scan even when the deep-link table
  redirects elsewhere. You get "Scanning for " with an empty model and a red
  `[startScan] Cannot convert 'undefined' to a Kotlin type` toast. Mapping the
  URL to another screen in `DeeplinkContext` does not prevent this; only
  `scan.tsx` guarding on a missing `deviceModel` would.

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
