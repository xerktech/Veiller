/**
 * Pure logic for the in-app Veiller updater (XERK-232): picking the newest
 * published Android APK out of the GitHub release list and deciding whether it
 * is newer than what's installed. The network fetch + download + install live
 * in `appUpdater.ts`; this stays pure so it can be unit-tested off-device.
 *
 * Modeled on Turma's `core/Update.kt`, which solves the same problem for the
 * same distribution model: `.github/workflows/release.yml` attaches the APK to
 * every GitHub Release as `veiller-v<version>.apk`, alongside the R8
 * `veiller-v<version>-mapping.txt`. The version baked into the asset FILENAME
 * is the authoritative one — the same rule the miniapp sync follows for bundle
 * zips (XERK-225) — so we compare that against the installed `versionName`
 * rather than the release TAG, which is free to run ahead of an asset that was
 * carried forward unchanged.
 */

/** `veiller-v0.3.2.apk` → `0.3.2`. Deliberately anchored so the sibling
 *  `veiller-v0.3.2-mapping.txt` can never match. */
const APK_NAME = /^veiller-v(\d+\.\d+\.\d+)\.apk$/

/** Parse the semver out of a `veiller-v<x.y.z>.apk` asset name, else null. */
export function apkAssetVersion(name: string): string | null {
  return APK_NAME.exec(name.trim())?.[1] ?? null
}

/**
 * Compare two dotted-numeric versions. Returns <0 if a<b, 0 if equal, >0 if
 * a>b. Missing/short components read as 0 (`0.4` === `0.4.0`); a non-numeric
 * component (a dev/placeholder version) reads as 0 rather than throwing.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.trim().split(".")
  const pb = b.trim().split(".")
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.parseInt(pa[i] ?? "", 10)
    const y = Number.parseInt(pb[i] ?? "", 10)
    const xn = Number.isNaN(x) ? 0 : x
    const yn = Number.isNaN(y) ? 0 : y
    if (xn !== yn) return xn - yn
  }
  return 0
}

/** An APK newer than what's installed, ready to offer to the user. */
export interface AvailableUpdate {
  version: string
  downloadUrl: string
}

/** Minimal projection of a GitHub release the picker needs, decoupled from wire shapes. */
export interface ReleaseView {
  draft: boolean
  prerelease: boolean
  assets: ReleaseAssetView[]
}

export interface ReleaseAssetView {
  name: string
  downloadUrl: string
}

/**
 * Given the parsed release list and the installed `versionName`, return the
 * newest publishable APK strictly newer than installed, or null if none exists
 * or we're already current. Draft and prerelease entries are skipped, and EVERY
 * APK across the fetched releases is considered (not only the single "latest"
 * release) so a carried-forward asset can't hide a build.
 */
export function latestApkUpdate(releases: ReleaseView[], installed: string): AvailableUpdate | null {
  let best: AvailableUpdate | null = null
  for (const release of releases) {
    if (release.draft || release.prerelease) continue
    for (const asset of release.assets) {
      const version = apkAssetVersion(asset.name)
      if (!version) continue
      if (!best || compareVersions(version, best.version) > 0) {
        best = {version, downloadUrl: asset.downloadUrl}
      }
    }
  }
  if (!best) return null
  return compareVersions(best.version, installed) > 0 ? best : null
}
