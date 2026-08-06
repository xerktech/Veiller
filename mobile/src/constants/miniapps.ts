export const cameraPackageName = "com.veiller.camera"
export const galleryPackageName = "com.veiller.gallery"
export const settingsPackageName = "com.veiller.settings"
export const simulatedPackageName = "com.veiller.simulated"
export const mirrorPackageName = "com.veiller.mirror"
export const notifyPackageName = "cloud.augmentos.notify"

/** True when this binary is the China (com.xerktech.veiller.cn) build. */
export const isChinaBuild = (): boolean => process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china"

/**
 * Apps that are not shipped in the China build: Notify. Enforced at every
 * registration surface — bundled-miniapp install, the offline-app catalog,
 * and the post-process filter that the cloud/local merge flows through.
 */
export const CHINA_HIDDEN_APPS = [notifyPackageName]

// these apps cannot be uninstalled:
export const SYSTEM_APPS = [
  cameraPackageName,
  galleryPackageName,
  settingsPackageName,
  simulatedPackageName,
  mirrorPackageName,
  notifyPackageName,
]
