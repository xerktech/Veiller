/**
 * Package names of built-in offline apps that render inside the Compositor
 * overlay via <OfflineAppHost /> instead of pushing their offlineRoute onto
 * the root expo-router stack.
 *
 * Kept separate from offlineAppRegistry so launch-decision call sites
 * (BuiltInMiniappCatalog, AppSwitcher) don't transitively import every hosted
 * screen component.
 *
 * Deliberately excludes captions / notify — no offlineRoute, nothing to render.
 */
// XERK-200/XERK-206: cameraPackageName removed from the hosted set — the
// camera/gallery offline app is parked and its screens were removed.
import {mirrorPackageName, settingsPackageName} from "@/constants/miniapps"

export const OFFLINE_HOSTED_PACKAGES = new Set([settingsPackageName, mirrorPackageName])

export const isOfflineHosted = (packageName: string) => OFFLINE_HOSTED_PACKAGES.has(packageName)
