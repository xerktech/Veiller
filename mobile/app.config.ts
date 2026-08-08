import "tsx/cjs"
import {ExpoConfig, ConfigContext} from "@expo/config"
import {getBuildNumber} from "./scripts/build-number.mjs"

const VARIANTS = {
  default: {
    appName: "Veiller",
    packageName: "com.xerktech.veiller",
    icon: "./assets/app-icons/ic_launcher.png",
    adaptiveIcon: "./assets/app-icons/ic_launcher_foreground.png",
  },
  cn: {
    appName: "Veiller",
    packageName: "com.xerktech.veiller.cn",
    icon: "./assets/app-icons/ic_launcher_china.png",
    adaptiveIcon: "./assets/app-icons/ic_launcher_foreground_china.png",
  },
  stable: {
    appName: "Veiller Stable",
    packageName: "com.xerktech.veiller.stable",
    icon: "./assets/app-icons/ic_launcher.png",
    adaptiveIcon: "./assets/app-icons/ic_launcher_foreground.png",
  },
} as const

const variant = process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china" ? VARIANTS.cn : VARIANTS.default

/**
 * @param config ExpoConfig coming from the static config app.json if it exists
 *
 * You can read more about Expo's Configuration Resolution Rules here:
 * https://docs.expo.dev/workflow/configuration/#configuration-resolution-rules
 */
module.exports = ({config}: ConfigContext): Partial<ExpoConfig> => {
  // Optional build-variant suffix. Set VEILLER_BUILD_NAME=stable to produce
  // a parallel-installable build with package com.xerktech.veiller.stable and
  // app label "stable". Leave unset for the normal Veiller build.
  const variantName = process.env.VEILLER_BUILD_NAME?.trim() || null
  const isValidVariant = variantName && /^[a-zA-Z][a-zA-Z0-9_ ]*$/.test(variantName)
  if (variantName && !isValidVariant) {
    throw new Error(
      `VEILLER_BUILD_NAME="${variantName}" is invalid. Must start with a letter and contain only letters, digits, spaces, or underscores.`,
    )
  }
  const appName = isValidVariant ? variantName : variant.appName
  const baseId = variant.packageName
  // replace non-alphanumeric characters with underscores:
  const normalizedVariantId = variantName?.toLowerCase().replace(/[^a-zA-Z0-9_]/g, "")
  const androidPackage = isValidVariant ? `${baseId}.${normalizedVariantId}` : baseId
  const iosBundleId = isValidVariant ? `${baseId}.${normalizedVariantId}` : baseId

  // Mapbox runtime token (pk.…) — boots the Mapbox Navigation SDK v3 on BOTH
  // platforms now (iOS migrated off Google Nav to match Android). Injected as:
  //   • Android: AndroidManifest meta-data `com.mapbox.token` (read by
  //     NavigationManager.kt → MapboxOptions.accessToken).
  //   • iOS: Info.plist `MBXAccessToken` (read by the Mapbox iOS SDK at boot).
  // Public token, safe to ship; the secret Downloads:Read token (sk.…) is
  // build-time-only and lives in ~/.gradle/gradle.properties (Android) / the
  // CocoaPods netrc (iOS), never here. Fail loudly in CI/EAS, warn in local
  // dev. See issues/mapbox-navigation-migration.md.
  // The China build (cn variant) ships without Veiller Map, so it has no nav
  const isChinaBuild = variant === VARIANTS.cn
  // Veiller: Mapbox / on-device navigation is disabled (NavigationManager is a
  // no-op stub, the crust gradle Mapbox deps are removed). A missing Mapbox
  // token is therefore expected and must NOT fail the build — upstream threw in
  // CI when the token was absent. Warn only.
  const mapboxAccessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""
  if (!mapboxAccessToken && !isChinaBuild) {
    console.warn(
      "[mobile/app.config] EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN not set — navigation is disabled in Veiller (expected).",
    )
  }

  const buildNumber = getBuildNumber()

  return {
    ...config,
    name: appName,
    slug: "Veiller",
    version: process.env.EXPO_PUBLIC_VEILLER_VERSION || "2.9.1",
    scheme: "com.xerktech.veiller",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: variant.icon,
    updates: {
      fallbackToCacheTimeout: 0,
    },
    jsEngine: "hermes",
    assetBundlePatterns: ["**/*"],
    android: {
      // icon: "./assets/app-icons/ic_launcher.png",
      package: androidPackage,
      versionCode: buildNumber,
      adaptiveIcon: {
        foregroundImage: variant.adaptiveIcon,
        // backgroundImage: "./assets/app-icons/ic_launcher.png",
        backgroundColor: "#0E1116",
      },
      allowBackup: false,
      permissions: [
        "ACCESS_FINE_LOCATION",
        "NEARBY_WIFI_DEVICES",
        "ACCESS_WIFI_STATE",
        "ACCESS_NETWORK_STATE",
        "CHANGE_WIFI_STATE",
        "CHANGE_NETWORK_STATE",
        // In-app self-update (XERK-232): Veiller is sideloaded, so the app
        // downloads its own newer APK from GitHub Releases and hands it to the
        // system package installer. Play-Store-sensitive, but this build has no
        // Play channel — see .github/workflows/release.yml.
        "android.permission.REQUEST_INSTALL_PACKAGES",
      ],
      // Some merged library manifests pull in ACCESS_BACKGROUND_LOCATION, but we
      // only need while-in-use location: it is used for BLE scanning and for the
      // phone-location foreground service (PhoneLocationService) that streams
      // location to miniapps. (Android turn-by-turn navigation is a stub in this
      // fork, so it is not a location consumer.) Blocking background location
      // avoids the Play Store background-location declaration/video review.
      blockedPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION"],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "apps.mentraglass.com",
              pathPrefix: "/package/",
            },
          ],
          category: ["DEFAULT", "BROWSABLE"],
        },
      ],
    },
    ios: {
      icon: variant.icon,
      supportsTablet: false,
      requireFullScreen: true,
      buildNumber: String(buildNumber),
      bundleIdentifier: iosBundleId,
      appleTeamId: "T5XXXL6N36",
      associatedDomains: ["applinks:apps.mentraglass.com"],
      infoPlist: {
        NSCameraUsageDescription: "This app needs access to your camera to capture images.",
        NSMicrophoneUsageDescription:
          "Veiller uses your microphone to enable the 'Hey Mira' AI assistant and provide live captions for deaf and hard-of-hearing users on smart glasses. For example, you can say 'Hey Mira, what's on my calendar today?' or the app can caption conversations in real-time on your glasses display.",
        NSBluetoothAlwaysUsageDescription: "This app needs access to your Bluetooth to connect to your glasses.",
        NSLocationWhenInUseUsageDescription:
          "Veiller uses your location to display nearby points of interest, weather updates, and navigation directions on your smart glasses. For example, when you're walking, the app can show restaurants within 100 meters or provide turn-by-turn directions to your destination on your glasses display.",
        NSBluetoothPeripheralUsageDescription: "This app needs access to your Bluetooth to connect to your glasses.",
        NSCalendarsUsageDescription:
          "Veiller accesses your calendar to display upcoming events and reminders directly on your smart glasses. For example, the app can show 'Meeting with John at 3 PM in Conference Room A' or remind you '15 minutes until dentist appointment' on your glasses display.",
        NSCalendarsFullAccessUsageDescription:
          "Veiller accesses your calendar to display upcoming events and reminders directly on your smart glasses. For example, the app can show 'Meeting with John at 3 PM in Conference Room A' or remind you '15 minutes until dentist appointment' on your glasses display.",
        NSCalendarUsageDescription:
          "Veiller accesses your calendar to display upcoming events and reminders directly on your smart glasses. For example, the app can show 'Meeting with John at 3 PM in Conference Room A' or remind you '15 minutes until dentist appointment' on your glasses display.",
        NSPhotoLibraryUsageDescription:
          "This app needs access to your photo library to provide you with photo based information on your glasses.",
        NSPhotoLibraryAddUsageDescription:
          "Allow Veiller to save photos and videos from your glasses to your camera roll.",
        NSUserNotificationUsageDescription:
          "This app needs access to your notifications to provide you with notifications.",
        NSLocalNetworkUsageDescription:
          "Veiller needs to access your local network to connect to Mentra Live glasses for viewing photos and media stored on the device.",
        // Required because miniapps subscribed to `heading_update` cause
        // the host's HeadingService to read the device compass via
        // CoreMotion. iOS hard-crashes any access to motion sensors
        // without this usage string declared.
        NSMotionUsageDescription:
          "Veiller reads your device compass to show heading direction in navigation and similar miniapps on your glasses.",
        NSBonjourServices: ["_mentra-live._tcp", "_http._tcp"],
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
          NSAllowsArbitraryLoads: true,
          NSExceptionDomains: {
            localhost: {
              NSExceptionAllowsInsecureHTTPLoads: true,
            },
          },
        },
        UIBackgroundModes: ["bluetooth-central", "audio", "location", "processing", "fetch"],
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "Veiller requires background location access to deliver continuous updates for apps like navigation and running, even when the app isn't in the foreground.",
        UIRequiresFullScreen: true,
        UISupportedInterfaceOrientations: [
          "UIInterfaceOrientationPortrait",
          "UIInterfaceOrientationPortraitUpsideDown",
        ],
        BGTaskSchedulerPermittedIdentifiers: ["com.veiller.background-timer"],
        // Mapbox Navigation SDK v3 (iOS) reads its public access token from
        // Info.plist under `MBXAccessToken` at boot. Replaces the old
        // GOOGLE_NAV_API_KEY now that iOS nav is Mapbox (matching Android,
        // which injects the same pk.… token as AndroidManifest meta-data).
        // Public token, safe to ship.
        MBXAccessToken: mapboxAccessToken,
      },
      config: {
        usesNonExemptEncryption: false,
      },
      entitlements: {
        "com.apple.developer.networking.wifi-info": true,
        "com.apple.developer.networking.HotspotConfiguration": true,
      },
    },
    plugins: [
      // our custom plugins:
      "./plugins/remove-ipad-orientations.js",
      // crust's own config plugin carries its Android build contract (Mapbox
      // downloads repo, protobuf-javalite exclusion, core-library desugaring).
      "@veiller/crust",
      "./plugins/android.ts",
      // Mapbox Navigation SDK v3 for iOS — added as a Swift Package (SPM is the
      // ONLY supported v3 install path; CocoaPods can't resolve it). The
      // mapbox-navigation-ios package transitively brings MapboxMaps,
      // MapboxCommon, MapboxCoreMaps, and Turf, so SPM is the SOLE Mapbox
      // provider. We intentionally do NOT use @rnmapbox/maps — its CocoaPods
      // copies of those same frameworks collided with SPM's at the build-graph
      // level ("Multiple commands produce …MapboxCommon.framework"). The runtime
      // pk. token is injected into Info.plist as MBXAccessToken (above); the
      // secret Downloads:Read token is read from ~/.netrc at build time.
      "./plugins/mapbox-nav-ios.ts",
      // Crust is a CocoaPods target; SPM products linked to the app project
      // aren't visible to it. This links the Mapbox products into the Crust
      // pod target (via Podfile post_install) so its Swift can import them.
      "./plugins/mapbox-nav-crust-link.ts",
      [
        "./modules/bluetooth-sdk/app.plugin.js",
        {
          node: true,
        },
      ],
      // "./plugins/withSplashScreen.ts",
      // library plugins:
      "expo-asset",
      "expo-localization",
      "expo-font",
      // expo-media-library removed in XERK-207: the G2 has no camera, so the
      // glasses-photo gallery-save path is orphaned. Photo/storage permissions
      // are stripped in plugins/android.ts.
      [
        "expo-splash-screen",
        {
          image: "./assets/logo/logo_light.png",
          resizeMode: "cover",
          imageWidth: 100,
          backgroundColor: "#fff",
          dark: {
            // backgroundColor: "#fff",
            backgroundColor: "#0E1116",
            image: "./assets/logo/logo_dark.png",
          },
        },
      ],
      "expo-router",
      [
        "react-native-permissions",
        {
          iosPermissions: [
            "Microphone",
            "Calendars",
            "Bluetooth",
            "LocationAccuracy",
            "LocationWhenInUse",
            "LocationAlways",
            "Notifications",
          ],
        },
      ],
      // expo-camera + iOS Camera/PhotoLibrary permission handlers removed in
      // XERK-207: the phone-camera QR scanner was dropped and the mirror
      // recorder was already dead, so the CAMERA permission is no longer needed
      // (it is stripped from the Android manifest in plugins/android.ts).
      // "react-native-bottom-tabs",
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 28,
            targetSdkVersion: 35,
            compileSdkVersion: 36,
            enableCoreLibraryDesugaring: true,
            // R8 code shrinking + resource shrinking for release builds. The
            // unshrunk APK carried ~70MB of dex; R8 tree-shakes unused library
            // code (XERK-200). The release CI attaches the R8 mapping.txt to
            // each release so obfuscated crash traces stay resolvable (Sentry
            // mapping upload is disabled in this pipeline).
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            extraProguardRules: [
              // JNI callbacks: sherpa-onnx and ONNX Runtime native code looks
              // these classes up by name (FindClass) at runtime, which R8
              // cannot see — keep them wholesale.
              "-keep class com.k2fsa.sherpa.onnx.** { *; }",
              "-keep class ai.onnxruntime.** { *; }",
              // Bluetooth SDK: lc3/sherpa JNI and reflective glue resolve
              // these by name; the module is small, keep it all.
              "-keep class com.veiller.bluetoothsdk.** { *; }",
            ].join("\n"),
          },
          ios: {
            deploymentTarget: "15.5", // for react-native-zip-archive
            extraPods: [
              {
                name: "SDWebImage",
                modular_headers: true,
              },
              {
                name: "SDWebImageSVGCoder",
                modular_headers: true,
              },
            ],
          },
          // buildReactNativeFromSource: true,
          // useHermesV1: true
        },
      ],
      [
        "@sentry/react-native/expo",
        {
          url: "https://sentry.io/",
          project: "veiller",
          organization: "xerktech",
          experimental_android: {
            enableAndroidGradlePlugin: false,
            autoUploadProguardMapping: true,
            includeProguardMapping: true,
            dexguardEnabled: true,
            uploadNativeSymbols: true,
            autoUploadNativeSymbols: true,
            includeNativeSources: true,
            includeSourceContext: true,
          },
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow Veiller to use your location.",
        },
      ],
      "expo-audio",
      [
        "expo-video",
        {
          supportsBackgroundPlayback: true,
          supportsPictureInPicture: true,
        },
      ],
      "expo-web-browser",
      "expo-image",
    ],
    experiments: {
      tsconfigPaths: true,
      typedRoutes: true,
    },
  }
}
