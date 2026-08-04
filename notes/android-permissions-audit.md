---
status: completed
owner: Malcolm Habeeb
---

# Android permission audit (Foverlay) — XERK-207

Evaluation of every Android permission the Foverlay mobile app declares, what
actually needs it, and whether it can be removed. Ticket:
[XERK-207](https://xerktech.atlassian.net/browse/XERK-207).

This is the Foverlay fork, which has been stripped down relative to upstream
MentraOS: user accounts/auth removed (XERK-198), several miniapps removed
(Maps, Notes, AI, Feedback, Merge, Teleprompter, Recorder — XERK-202), and
Android navigation migrated off the paid Google Navigation SDK to a native
**stub** (the Mapbox Nav SDK dependency was dropped). Those removals are the
reason some declared permissions no longer map cleanly to a live feature.

## Where the merged manifest comes from

There is no checked-in `AndroidManifest.xml` for the app — it is assembled by
Expo prebuild from these sources (later sources win / merge):

| Source | Role |
|---|---|
| `mobile/app.config.ts` → `android.permissions[]` | Additive list Expo injects |
| `mobile/app.config.ts` → `android.blockedPermissions[]` | `tools:node="remove"` on merge |
| `mobile/plugins/android.ts` (`withAndroidManifestModifications`) | **Authoritative** add/remove pass — `permissionsToAdd`, `permissionsToRemove`, `maxSdkVersion` caps |
| `mobile/modules/bluetooth-sdk/android/src/main/AndroidManifest.xml` | BLE, audio, foreground-service, network perms + the `ForegroundService` |
| `mobile/modules/crust/android/src/main/AndroidManifest.xml` | Notification-listener bridge (`BIND_NOTIFICATION_LISTENER_SERVICE` + custom signature perm) |
| Auto-merged AAR manifests from deps | `expo-camera`, `expo-media-library`, `expo-location`, `expo-calendar`, `expo-notifications`, `@config-plugins/react-native-webrtc`, LiveKit |

`plugins/android.ts` is the file to edit to add/remove app-level permissions.

## Verdict table

Legend — **Keep**: justified by a live feature. **Remove**: safe to drop now.
**Cleanup**: tied to a dead/orphaned feature; removable with care (may still be
re-declared by a dependency, so verify the merged manifest after).

| Permission | Source | What needs it | Verdict |
|---|---|---|---|
| `BLUETOOTH` / `BLUETOOTH_ADMIN` (maxSdk 30) | android.ts, bt-sdk | Legacy BLE on ≤ API 30 — glasses transport | **Keep** |
| `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT` / `BLUETOOTH_ADVERTISE` | android.ts, bt-sdk | Core glasses BLE (scan/connect). `MentraBluetoothSdk.kt` | **Keep** |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | app.config, bt-sdk | **BLE scanning** (pre-API-31) **+ phone-location streaming** to miniapps (`PhoneLocationService.ts`, `LocationManager.ts`). NOT navigation | **Keep** |
| `ACCESS_BACKGROUND_LOCATION` | (merged by nav/location) | — | **Already blocked** (`app.config.ts` `blockedPermissions`) — correct |
| `NEARBY_WIFI_DEVICES` | app.config | API-33+ substitute for the BLE-scan location perm (`facades/permissions.ts:35`) + WiFi provisioning | **Keep** |
| `ACCESS_WIFI_STATE` / `CHANGE_WIFI_STATE` / `CHANGE_NETWORK_STATE` | app.config, bt-sdk | Glasses WiFi provisioning + hotspot gallery sync (`wifi/scan.tsx`, `ControllerManager.kt`, `gallerySync`) | **Keep** |
| `ACCESS_NETWORK_STATE` / `INTERNET` | app.config, bt-sdk | Backend/API + Mapbox Routes HTTP API + Sentry | **Keep** |
| `RECORD_AUDIO` | bt-sdk (+ expo-camera, webrtc) | Phone mic → glasses STT/captions (`PhoneMic.kt` `AudioRecord`) + mirror-mode video-with-audio (`mirror/fullscreen.tsx`) | **Keep** |
| `MODIFY_AUDIO_SETTINGS` | bt-sdk (+ webrtc) | Audio routing for phone-mic path | **Keep** |
| `CAMERA` | expo-camera (+ webrtc) | **Phone** camera: mirror-mode recorder (`mirror/fullscreen.tsx:313`) + dev-miniapp QR scanner (`miniappdev/scanner.tsx:284`). (Glasses photos arrive over BLE, not this perm) | **Keep** |
| `FOREGROUND_SERVICE` | android.ts, bt-sdk | The connected-device foreground service (`DeviceManager.kt`) | **Keep** |
| `FOREGROUND_SERVICE_CONNECTED_DEVICE` | android.ts, bt-sdk | Service type for the BLE glasses link | **Keep** |
| `FOREGROUND_SERVICE_MICROPHONE` | android.ts, bt-sdk | Phone-mic capture in the foreground service | **Keep** |
| `FOREGROUND_SERVICE_DATA_SYNC` | android.ts, bt-sdk | Gallery sync / background data | **Keep** |
| `FOREGROUND_SERVICE_LOCATION` | android.ts, bt-sdk | `PhoneLocationService` background/foreground location. NOT navigation (the `app.config.ts` comment attributing it to the "Google Navigation SDK" is stale) | **Keep** (fix comment) |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | android.ts, bt-sdk | `expo-video` background playback (`supportsBackgroundPlayback: true`) + service type bit | **Keep** (see note 3) |
| `POST_NOTIFICATIONS` | android.ts | Foreground-service notification on API 33+ (`DeviceManager.kt`) | **Keep** |
| `BIND_NOTIFICATION_LISTENER_SERVICE` + `…CRUST_NOTIFICATION_BRIDGE` | crust manifest | Phone-notification → glasses bridge, UI-reachable (`privacy.tsx` → `NotificationServiceUtils.tsx`) | **Keep** |
| `QUERY_ALL_PACKAGES` | android.ts | Per-app notification picker enumerates all installed apps (`NotificationListener.kt:188` `getInstalledApplications`) | **Keep** — but Play-sensitive (note 4) |
| `READ_PHONE_STATE` | android.ts | Call-state detection so the phone mic yields during calls (`PhoneMic.kt:735`); requested in pairing | **Keep** — but Play-sensitive (note 4) |
| `WRITE_EXTERNAL_STORAGE` (maxSdk 29) | expo-media-library AAR | Saving glasses photos to the gallery via Crust/MediaStore on API 28–29 (`CrustModule.saveToGalleryWithDate`) | **Keep** |
| `READ_EXTERNAL_STORAGE` (maxSdk 32) | merged / PermissionsUtils | Legacy read on old APIs | **Keep** |
| `WAKE_LOCK` | bt-sdk (+ webrtc) | Keep BLE/audio service alive | **Keep** |
| `VIBRATE` | bt-sdk | Haptics | **Keep** |
| `RECEIVE_BOOT_COMPLETED` | android.ts | Re-establish glasses service after reboot | **Keep** |
| `${package}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | android.ts | Android 14 requirement for dynamically-registered receivers | **Keep** |
| `READ_CALENDAR` / `WRITE_CALENDAR` | expo-calendar AAR | Calendar events forwarded to glasses/miniapps (`MantleManager.ts`, `PhoneCalendarService.ts`, `privacy.tsx` toggle) | **Keep** |
| `android.permission.NEARBY_DEVICES` | android.ts:263 | **Nothing — not a real Android permission** | **Remove** (note 1) |
| `com.google.android.gms.permission.AD_ID` | (Firebase transitive) | — | **Already removed** (`tools:node="remove"`) — correct |
| `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `WRITE_MEDIA_VIDEO` / `ACCESS_MEDIA_LOCATION` | (media libs) | — | **Already removed** for Play compliance — correct |

## Removal candidates (the answer to the ticket)

### 1. `android.permission.NEARBY_DEVICES` — remove now (zero risk) ✅ applied

`plugins/android.ts:263` adds `android.permission.NEARBY_DEVICES`. **No such
Android platform permission exists** — the real permissions are
`NEARBY_WIFI_DEVICES` (already declared in `app.config.ts`) and the
`BLUETOOTH_*` family. Android silently ignores an unknown permission string, so
this line has been a no-op. It appears nowhere else in the codebase. Removed in
this change. This is the one unambiguously removable permission.

### 2. LiveKit + `react-native-webrtc` stack — orphaned, cleanup candidate

`@livekit/react-native`, `@livekit/react-native-webrtc`,
`@livekit/react-native-expo-plugin`, and `@config-plugins/react-native-webrtc`
are still deps + config plugins, but the runtime is **not wired**:
`src/app/_layout.tsx:2-3,54-55` has `registerGlobals` commented out and there is
no live LiveKit `Room`/`connect` usage. The streaming that *is* live streams the
**glasses** camera over BLE/WHIP (`PhoneStreamCoordinator.ts`), not the phone's
WebRTC stack.

Removing these would shrink the APK and drop the WebRTC-injected manifest
entries. **It would not net-remove any permission** — every permission WebRTC
merges (`CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `WAKE_LOCK`,
`INTERNET`, `ACCESS_NETWORK_STATE`, `BLUETOOTH_*`) is already independently
justified above. Treat as a **dependency-cleanup follow-up**, not a permission
reduction, and verify the glasses WebRTC/WHIP stream path first. Out of scope
for this ticket.

### 3. `expo-media-library` — plugin present, JS API unused

The `expo-media-library` **JS API is never called in shipped code** (only in a
bundled `example/App.tsx`); glasses-photo saving goes through
`CrustModule.saveToGalleryWithDate` (native MediaStore). The library survives as
a config plugin that contributes `WRITE_EXTERNAL_STORAGE` (maxSdk 29) and the
media permission strings. **Do not naively remove it**: `WRITE_EXTERNAL_STORAGE`
is still required for the Crust gallery save on API 28–29 (minSdk is 28), and
`android.ts` does not otherwise add it. If the dependency is dropped,
`WRITE_EXTERNAL_STORAGE (maxSdk 29)` must be added explicitly to
`permissionsToAdd`. Follow-up, not part of this ticket.

### 4. Play Store-sensitive permissions (justified, but carry review cost)

These are all genuinely used but each triggers Google Play policy overhead —
worth knowing they are the "expensive" ones to keep:

- **`QUERY_ALL_PACKAGES`** — requires a Play Console declaration form. Used to
  list every installed app in the notification picker. If the picker were
  changed to a curated set, this could be narrowed to a `<queries>` element, but
  as designed (show *all* apps) `QUERY_ALL_PACKAGES` is the correct API.
- **`READ_PHONE_STATE`** — sensitive. Only used for call-state detection to mute
  the phone mic during calls. Could theoretically be dropped if that
  mute-during-call behavior is acceptable to lose, but it's a legitimate small
  use.
- **Notification listener** (`BIND_NOTIFICATION_LISTENER_SERVICE`) — sensitive;
  core to the notification-forwarding feature.

## Dead code noted along the way (not permissions, but related)

The Android **navigation** path is orphaned: `NavigationManager.kt` is an
explicit Foverlay stub that errors "Navigation is not available in this build,"
yet `NavigationService` / `NavigationHandlers` / `NavigationModule` /
`CrustModule.startNavigation` and a Super-Mode debug trigger
(`debug.tsx:204`) still call into it. This is a separate cleanup ticket; it does
not change the permission conclusions (location stays for BLE + phone-location).

## Changes applied in XERK-207

- Removed the no-op `android.permission.NEARBY_DEVICES` from
  `plugins/android.ts`.
- Corrected the stale `app.config.ts` comment that attributed the location
  foreground service / background-location block to the Google Navigation SDK;
  the real justification is BLE scanning + phone-location streaming.

Everything else is justified and retained.
