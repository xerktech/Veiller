/**
 * Veiller miniapp source list — the single file that decides which miniapps
 * this build installs (XERK-214).
 *
 * Veiller ships with ZERO miniapps bundled into the APK. Instead, every time
 * the app starts it reads this list and, for each entry, pulls the latest
 * miniapp bundle straight from that repo's GitHub Releases and installs it
 * (see src/services/miniapps/veillerMiniappSync.ts).
 *
 * To ship a new miniapp with Veiller: publish its bundle as a Release asset in
 * a public GitHub repo (see the naming contract below) and add an entry here.
 *
 * ── Release-asset contract ────────────────────────────────────────────────
 * The sync scans a repo's Releases (newest first) and picks the newest
 * non-draft release that carries a Veiller bundle asset. By default a bundle
 * asset is any asset whose name matches /veiller.*\.zip$/i — the Turma/Tenir
 * pipelines publish `<repo>-veiller-v<version>.zip` (e.g.
 * `turma-veiller-v0.6.47.zip`) next to their other release assets. Override
 * `assetPattern` per entry if a repo names its bundle differently.
 *
 * The release must be tagged `v<version>` (or `<version>`), where `<version>`
 * equals the `version` field inside the bundle's miniapp.json — the app records
 * that version once installed, so the already-installed check can skip a
 * re-download without unzipping. The zip must be a flat Veiller miniapp bundle
 * (miniapp.json at the root), the same shape produced by `veiller-miniapp pack`.
 *
 * The repos must be public (release assets are fetched unauthenticated).
 */

export interface VeillerMiniappSource {
  /** GitHub "owner/repo" whose Releases publish the miniapp bundle. */
  repo: string
  /** The miniapp package id, e.g. "com.xerktech.turma". Used for the already-installed check. */
  packageName: string
  /**
   * Human-readable name shown in the miniapp store (XERK-217). Used as the row
   * label before the miniapp is installed; once installed, the manifest name
   * from the on-disk bundle takes over.
   */
  name: string
  /**
   * Optional case-insensitive regex (as a string) matched against release asset
   * names to locate the bundle. Defaults to /veiller.*\.zip$/i.
   */
  assetPattern?: string
}

export const VEILLER_MINIAPPS: VeillerMiniappSource[] = [
  {repo: "xerktech/Turma", packageName: "com.xerktech.turma", name: "Turma"},
  {repo: "xerktech/Tenir", packageName: "com.xerktech.tenir", name: "Tenir"},
]
