/**
 * Foverlay miniapp source list — the single file that decides which miniapps
 * this build installs (XERK-214).
 *
 * Foverlay ships with ZERO miniapps bundled into the APK. Instead, every time
 * the app starts it reads this list and, for each entry, pulls the latest
 * miniapp bundle straight from that repo's GitHub Releases and installs it
 * (see src/services/miniapps/foverlayMiniappSync.ts).
 *
 * To ship a new miniapp with Foverlay: publish its bundle as a Release asset in
 * a public GitHub repo (see the naming contract below) and add an entry here.
 *
 * ── Release-asset contract ────────────────────────────────────────────────
 * The sync scans a repo's Releases (newest first) and picks the newest
 * non-draft release that carries a Foverlay bundle asset. By default a bundle
 * asset is any asset whose name matches /foverlay.*\.zip$/i — the Turma/Tenir
 * pipelines publish `<repo>-foverlay-v<version>.zip` (e.g.
 * `turma-foverlay-v0.6.47.zip`) next to their other release assets. Override
 * `assetPattern` per entry if a repo names its bundle differently.
 *
 * The release must be tagged `v<version>` (or `<version>`), where `<version>`
 * equals the `version` field inside the bundle's miniapp.json — the app records
 * that version once installed, so the already-installed check can skip a
 * re-download without unzipping. The zip must be a flat Mentra miniapp bundle
 * (miniapp.json at the root), the same shape produced by `mentra-miniapp pack`.
 *
 * The repos must be public (release assets are fetched unauthenticated).
 */

export interface FoverlayMiniappSource {
  /** GitHub "owner/repo" whose Releases publish the miniapp bundle. */
  repo: string
  /** The miniapp package id, e.g. "com.xerktech.turma". Used for the already-installed check. */
  packageName: string
  /**
   * Optional case-insensitive regex (as a string) matched against release asset
   * names to locate the bundle. Defaults to /foverlay.*\.zip$/i.
   */
  assetPattern?: string
}

export const FOVERLAY_MINIAPPS: FoverlayMiniappSource[] = [
  {repo: "xerktech/Turma", packageName: "com.xerktech.turma"},
  {repo: "xerktech/Tenir", packageName: "com.xerktech.tenir"},
]
