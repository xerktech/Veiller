const VARIANTS = {
  default: {
    packageName: "com.xerktech.veiller",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.xerktech.veiller",
    playStoreBetaUrl: "https://play.google.com/apps/testing/com.xerktech.veiller",
    appStoreUrl: "https://apps.apple.com/app/id6747363193",
    appStoreReviewUrl: "https://apps.apple.com/app/id6747363193?action=write-review",
    cdnBaseUrl: "https://mentra-videos-cdn.mentraglass.com",
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
export const CDN_BASE_URL = variant.cdnBaseUrl
