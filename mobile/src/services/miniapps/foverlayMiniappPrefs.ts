/**
 * Per-miniapp install/update preferences for the Foverlay miniapp store
 * (XERK-217).
 *
 * The store screen lets the user check/uncheck each Foverlay miniapp. A checked
 * (enabled) app is installed and kept up to date by foverlayMiniappSync on every
 * startup; an unchecked (disabled) app is skipped by the sync — it is neither
 * installed nor updated. Unchecking does NOT uninstall an already-installed app;
 * it just pauses future install/update (see the ticket: "it doesn't install and
 * update").
 *
 * State is a single MMKV-backed map of packageName -> enabled. Absent means
 * enabled (the default: a freshly shipped app installs without the user having
 * to opt in), so the store starts with everything checked.
 */
import {storage} from "@/utils/storage/storage"

/** MMKV key holding the {packageName: enabled} map. */
const STORAGE_KEY = "foverlay_miniapp_enabled"

type EnabledMap = Record<string, boolean>

function loadMap(): EnabledMap {
  const res = storage.load<EnabledMap>(STORAGE_KEY)
  if (res.is_ok() && res.value && typeof res.value === "object") {
    return res.value
  }
  return {}
}

/**
 * Whether a Foverlay miniapp is enabled (checked) for install/update. Unknown
 * packages default to enabled so a newly added app installs without the user
 * having to flip a switch first.
 */
export function isFoverlayMiniappEnabled(packageName: string): boolean {
  return loadMap()[packageName] ?? true
}

/** Set a Foverlay miniapp's enabled (checked) state. */
export function setFoverlayMiniappEnabled(packageName: string, enabled: boolean): void {
  const map = loadMap()
  map[packageName] = enabled
  storage.save(STORAGE_KEY, map)
}
