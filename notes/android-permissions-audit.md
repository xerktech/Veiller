---
status: active
owner: Malcolm Habeeb
---

# Android permission audit (Foverlay) — XERK-207

Evaluation of every Android permission the Foverlay mobile app declares, which
**component** needs it, and whether it can be killed. Ticket:
[XERK-207](https://xerktech.atlassian.net/browse/XERK-207).

Re-evaluated against `main` after XERK-206 ("Disable non-G2 device features").
**Supported devices are now only the Even Realities G2 glasses (no camera) and
the Tap Strap 2 controller.** That is what makes the camera/photo permissions
re-evaluable — the G2 has no camera, and the camera/gallery miniapp + all
camera-glasses (Mentra Live) pairing are commented out. Simulated Glasses
(phone mode) was intentionally kept.

Earlier fork history that shaped this: auth removed (XERK-198), several miniapps
removed (XERK-202), Android navigation reduced to a stub (Mapbox Nav SDK
dropped).

## Where the merged manifest comes from

There is no checked-in `AndroidManifest.xml` — Expo prebuild assembles it from:

| Source | Role |
|---|---|
| `mobile/app.config.ts` → `android.permissions[]` / `blockedPermissions[]` | Additive list + `tools:node="remove"` |
| `mobile/plugins/android.ts` (`withAndroidManifestModifications`) | **Authoritative** add/remove pass + `maxSdkVersion` caps |
| `mobile/modules/bluetooth-sdk/.../AndroidManifest.xml` | BLE, audio, foreground-service, network perms + `ForegroundService` |
| `mobile/modules/crust/.../AndroidManifest.xml` | Notification-listener bridge |
| Auto-merged AAR manifests | `expo-camera`, `expo-media-library`, `expo-location`, `expo-calendar`, `expo-notifications`, `react-native-webrtc`, LiveKit |

Edit `plugins/android.ts` to add/remove app-level permissions.

## Decision table — component → permission

Legend — **Keep**: live feature needs it. **Kill**: feature dead/orphaned on a
G2-only build, safe to drop. **Decision**: killable only if you also drop a
still-reachable feature (your call).

| Permission | Contributed by | Component / feature that needs it | Status on G2-only build | Verdict |
|---|---|---|---|---|
| `BLUETOOTH` / `BLUETOOTH_ADMIN` (maxSdk 30) | android.ts, bt-sdk | Legacy BLE ≤ API 30 — G2 transport | Live | **Keep** |
| `BLUETOOTH_SCAN` / `_CONNECT` / `_ADVERTISE` | android.ts, bt-sdk | G2 BLE scan/connect (`MentraBluetoothSdk`) | Live | **Keep** |
| `FOREGROUND_SERVICE` / `_CONNECTED_DEVICE` | android.ts, bt-sdk | BLE foreground service (`DeviceManager`) | Live | **Keep** |
| `WAKE_LOCK` | bt-sdk | Keep BLE/audio service alive | Live | **Keep** |
| `VIBRATE` | bt-sdk | Haptics | Live | **Keep** |
| `RECEIVE_BOOT_COMPLETED` | android.ts | Re-establish service after reboot | Live | **Keep** |
| `INTERNET` / `ACCESS_NETWORK_STATE` | app.config, bt-sdk | Backend/API, Sentry | Live | **Keep** |
| `…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | android.ts | Android 14 dynamic-receiver requirement | Live | **Keep** |
| `RECORD_AUDIO` | bt-sdk (+ camera/webrtc) | Phone mic → G2 STT/captions (`PhoneMic`) | Live | **Keep** |
| `MODIFY_AUDIO_SETTINGS` | bt-sdk | Audio routing for phone-mic path | Live | **Keep** |
| `FOREGROUND_SERVICE_MICROPHONE` | android.ts, bt-sdk | Phone mic in the foreground service | Live | **Keep** |
| `READ_PHONE_STATE` | android.ts | Mute phone mic during calls (`PhoneMic:735`) | Live | **Keep** (Play-sensitive) |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | app.config, bt-sdk | **BLE scanning** + **phone-location streaming to miniapps** (`PhoneLocationService`, boot tier-restore + miniapp SUBSCRIBE). NOT maps | Live | **Keep** |
| `FOREGROUND_SERVICE_LOCATION` | android.ts, bt-sdk | Phone-location foreground service | Live | **Keep** |
| `ACCESS_BACKGROUND_LOCATION` | (blocked) | — | Blocked | **Keep blocked** |
| `NEARBY_WIFI_DEVICES` | app.config | API-33+ BLE-scan substitute + WiFi provisioning | Live | **Keep** |
| `ACCESS_WIFI_STATE` / `CHANGE_WIFI_STATE` / `CHANGE_NETWORK_STATE` | app.config, bt-sdk | G2 WiFi provisioning + hotspot gallery sync (`wifi/scan.tsx`, `ControllerManager`) | Live | **Keep** |
| `POST_NOTIFICATIONS` | android.ts | Foreground-service notification (API 33+) | Live | **Keep** |
| `BIND_NOTIFICATION_LISTENER_SERVICE` + `…CRUST_NOTIFICATION_BRIDGE` | crust | Phone-notification → glasses bridge (`privacy.tsx`) | Live | **Keep** |
| `QUERY_ALL_PACKAGES` | android.ts | Per-app notification picker enumerates all apps (`NotificationListener:188`) | Live | **Keep** (Play-sensitive) |
| `READ_CALENDAR` / `WRITE_CALENDAR` | expo-calendar | Calendar events → glasses/miniapps (`MantleManager`, `PhoneCalendarService`) | Live | **Keep** |
| `CAMERA` | expo-camera (+ webrtc) | (a) mirror-mode recorder — **DEAD** (entry points commented out); (b) dev-miniapp **QR scanner** — **LIVE** (Super/dev mode, `miniappdev/scanner.tsx`) | Mixed | **Decision** — killable only if you drop QR-scan loading |
| `WRITE_EXTERNAL_STORAGE` (maxSdk 29) | expo-media-library AAR | Save glasses photos to gallery via Crust/MediaStore (`cameraRollExportCoordinator`) | **Orphaned** — no camera device feeds it | **Kill** |
| `READ_EXTERNAL_STORAGE` (maxSdk 32) | media/image AAR + basic perms | Legacy media read on old APIs | **Orphaned** with photos | **Kill** (verify no other lib) |
| `android.permission.NEARBY_DEVICES` | android.ts | Nothing — not a real Android permission | No-op | **Removed** in this PR |
| `AD_ID` / `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `WRITE_MEDIA_VIDEO` / `ACCESS_MEDIA_LOCATION` | (transitive) | — | Already stripped | **Already removed** — correct |

## The three groups you asked about

### Photos — kill (safe) ✅
The G2 has no camera, so nothing downloads photos to save. The gallery-save
chain (`gallerySyncService` → `cameraRollExportCoordinator` →
`CrustModule.saveToGalleryWithDate`) is still initialized at startup but has **no
reachable trigger** — its only source is a camera-glasses hotspot download.
`WRITE_EXTERNAL_STORAGE` + `READ_EXTERNAL_STORAGE` + the `expo-media-library`
dependency can all go. Caveat: the save code is not `hasCamera`-gated, so if the
gallery screen is ever forced open via raw deeplink the (photo-less) save call
would error instead of no-op — cosmetic, since it downloads nothing anyway.

### Maps — nothing to remove at the permission level
Navigation is already a stub (`NavigationManager.kt` errors "Navigation is not
available in this build"); the Mapbox Nav SDK is gone. **There is no
maps-specific Android permission.** The location permissions are *not* held for
maps — they are needed for BLE scanning and phone-location streaming to
miniapps, both still live. So "kill maps" yields only **dead-code cleanup**
(orphaned `NavigationService` / `NavigationHandlers` / `NavigationModule` /
`CrustModule.startNavigation` + the Super-Mode debug trigger), not a permission
reduction. Track as a separate cleanup ticket.

### Camera — your call
The camera-*glasses* and mirror-recorder uses are already dead. The one thing
still holding `CAMERA` is the **phone** camera powering the dev-miniapp **QR
scanner** (`miniapps/miniappdev/scanner.tsx`), reachable in developer / Super
Mode. Options:
- **Keep `CAMERA`** — retain QR-scan loading of dev miniapps.
- **Kill `CAMERA`** — remove/replace the QR scanner (e.g. manual URL entry for
  dev miniapps), then drop the `expo-camera` plugin and the perm.

## Play Store-sensitive permissions worth noting (all justified, kept)
- `QUERY_ALL_PACKAGES` — requires a Play declaration form; used by the
  notification per-app picker (shows *all* apps by design).
- `READ_PHONE_STATE` — sensitive; only mutes the phone mic during calls.
- Notification listener (`BIND_NOTIFICATION_LISTENER_SERVICE`) — sensitive; core
  to notification forwarding.

## Dependency cleanups (not permission reductions)
- Orphaned **LiveKit / `react-native-webrtc`** stack — deps + plugins present,
  runtime not wired (`_layout.tsx` `registerGlobals` commented out). Nets no
  permission change (every perm it merges is independently justified).
- **`expo-media-library`** — JS API unused; drop it as part of the photo removal
  above, but preserve `WRITE_EXTERNAL_STORAGE` only if any API 28–29 save path
  is reinstated.

## Changes applied in XERK-207 so far
- Removed the no-op `android.permission.NEARBY_DEVICES` from `plugins/android.ts`.
- Corrected the stale `app.config.ts` comment attributing the location
  foreground service / background-location block to the removed Google Nav SDK.

The camera/photo removals above are left for a keep/kill decision (this ticket is
the evaluation).
