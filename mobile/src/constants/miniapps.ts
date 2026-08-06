export const cameraPackageName = "com.mentra.camera"
export const galleryPackageName = "com.mentra.gallery"
export const settingsPackageName = "com.mentra.settings"
export const simulatedPackageName = "com.mentra.simulated"
export const mirrorPackageName = "com.mentra.mirror"
// Notify is no longer a registered miniapp (XERK-219) — the package name
// survives as the owner id for notification frames/audio in the display and
// audio arbiters, and for migrating the old miniapp's persisted state.
export const notifyPackageName = "cloud.augmentos.notify"

/** True when this binary is the China (com.xerktech.veiller.cn) build. */
export const isChinaBuild = (): boolean => process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china"

/**
 * Apps that are not shipped in the China build. Currently empty: Notify, the
 * one entry, stopped being a registered miniapp (XERK-219) — its China
 * restriction is now enforced by the notification-presentation gate in
 * MantleManager and the hidden toggle in the notifications settings page.
 */
export const CHINA_HIDDEN_APPS: string[] = []

// these apps cannot be uninstalled:
export const SYSTEM_APPS = [
  cameraPackageName,
  galleryPackageName,
  settingsPackageName,
  simulatedPackageName,
  mirrorPackageName,
]
