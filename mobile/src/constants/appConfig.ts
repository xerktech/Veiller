const VARIANTS = {
  default: {
    packageName: "com.xerktech.veiller",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.xerktech.veiller",
    playStoreBetaUrl: "https://play.google.com/apps/testing/com.xerktech.veiller",
    appStoreUrl: "https://apps.apple.com/app/id6747363193",
    appStoreReviewUrl: "https://apps.apple.com/app/id6747363193?action=write-review",
    cdnBaseUrl: "https://veiller-videos-cdn.mentraglass.com",
  },
  china: {
    packageName: "com.xerktech.veiller.cn",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.xerktech.veiller.cn",
    playStoreBetaUrl: "https://play.google.com/apps/testing/com.xerktech.veiller.cn",
    appStoreUrl: "https://apps.apple.com/app/id6747363193",
    appStoreReviewUrl: "https://apps.apple.com/app/id6747363193?action=write-review",
    cdnBaseUrl: "https://asset.mentraglass.cn",
  },
}

const variant =
  process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china" ? VARIANTS.china : VARIANTS.default

export const PACKAGE_NAME = variant.packageName
export const PLAY_STORE_URL = variant.playStoreUrl
export const PLAY_STORE_BETA_URL = variant.playStoreBetaUrl
export const APP_STORE_URL = variant.appStoreUrl
export const APP_STORE_REVIEW_URL = variant.appStoreReviewUrl
/**
 * Video asset host for onboarding/pairing walkthroughs.
 *
 * **This host is currently dead** — `veiller-videos-cdn.mentraglass.com`
 * answers HTTP 530 for every path, so any `<Video>` pointed at it fails to
 * load. Both remaining consumers are Mentra Live screens
 * (`/onboarding/mentra-live/…`), and the Mentra Live is parked (XERK-206), so
 * nothing a user can reach depends on it today. Do not wire this into a live
 * screen without first confirming the host serves, or the screen will show a
 * permanently blank player.
 */
export const CDN_BASE_URL = variant.cdnBaseUrl

/**
 * Where an Android user actually gets a newer build.
 *
 * Veiller is sideloaded on Android — there is no Play Store listing, which is
 * the whole reason the in-app updater exists (XERK-232). PLAY_STORE_URL 404s,
 * so anything offering the user an update must send them here instead. Kept in
 * step with `REPO` in src/services/update/appUpdater.ts.
 */
export const ANDROID_RELEASES_URL = "https://github.com/xerktech/Veiller/releases/latest"
