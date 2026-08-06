import {appRegistry} from "@veiller/engine/internal"
import {Directory, File, Paths} from "expo-file-system"

import {VEILLER_MINIAPPS, type VeillerMiniappSource} from "@/config/veillerMiniapps"
import {isVeillerMiniappEnabled} from "@/services/miniapps/veillerMiniappPrefs"

const LOG_TAG = "VeillerMiniappSync"

/** How long to wait on a GitHub API request before giving up (per repo). */
const API_TIMEOUT_MS = 15_000

/** Releases scanned per repo, newest first, looking for a miniapp asset. */
const RELEASES_PER_REPO = 30

/** Minimal shape of the pieces of the GitHub Releases API we consume. */
interface GithubReleaseAsset {
  name: string
  browser_download_url: string
}
interface GithubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: GithubReleaseAsset[]
}

/** A miniapp bundle located in a repo's releases, ready to download + install. */
export interface ResolvedBundle {
  packageName: string
  version: string
  downloadUrl: string
  assetName: string
}

/**
 * Default asset marker: the repos publish the Veiller bundle as
 * `<repo>-veiller-v<version>.zip` (e.g. `turma-veiller-v0.6.47.zip`), sitting
 * alongside unrelated assets (native-agent tarball, Android APK, manifest.json).
 * The `veiller` marker + `.zip` suffix selects exactly the bundle. A source may
 * override this with its own `assetPattern`.
 */
const DEFAULT_ASSET_PATTERN = /veiller.*\.zip$/i

/** Does this asset name look like a Veiller miniapp bundle for this source? */
function isBundleAsset(assetName: string, source: VeillerMiniappSource): boolean {
  const pattern = source.assetPattern ? new RegExp(source.assetPattern, "i") : DEFAULT_ASSET_PATTERN
  return pattern.test(assetName)
}

/**
 * Version embedded in a bundle asset name, e.g. `turma-veiller-v0.6.53.zip` →
 * `0.6.53`. The publishing pipelines name the asset after the version inside
 * its miniapp.json, so this is the authoritative source (see
 * {@link bundleVersion}).
 */
const ASSET_VERSION_PATTERN = /-v?(\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?)\.zip$/i

/**
 * The version to record for a release bundle (XERK-225).
 *
 * This must equal the `version` in the bundle's miniapp.json, because that is
 * what AppRegistry records on install and what the store compares against to
 * decide whether an update is available.
 *
 * The asset name is the reliable source: the pipelines publish
 * `<repo>-veiller-v<version>.zip` where `<version>` is the bundle's own
 * version. The release *tag* is not — a repo cuts a release for every change,
 * but re-attaches the previous bundle asset when the miniapp itself didn't
 * change, so tag `v0.6.57` can legitimately carry `turma-veiller-v0.6.53.zip`.
 * Deriving the version from the tag there reports 0.6.57 as "available" while
 * the install records 0.6.53, leaving the store stuck on "Update available"
 * and re-downloading the same bundle on every startup.
 *
 * Falls back to the tag (minus a leading `v`) for assets that don't encode a
 * version — worst case that's a redundant re-download, since
 * installFromLocalZip records the real miniapp.json version regardless.
 */
function bundleVersion(assetName: string, tag: string): string {
  return ASSET_VERSION_PATTERN.exec(assetName)?.[1] ?? tag.replace(/^v/i, "")
}

/**
 * Fetch a repo's releases (newest first) and return the newest non-draft
 * release that carries a Veiller bundle asset. GitHub returns releases in
 * reverse-chronological order, so the first match is the latest — this also
 * skips over release trains that don't publish the bundle (e.g. a repo that
 * also cuts native-agent tarball or Android APK releases under other tags).
 */
export async function resolveLatestBundle(source: VeillerMiniappSource): Promise<ResolvedBundle | null> {
  const url = `https://api.github.com/repos/${source.repo}/releases?per_page=${RELEASES_PER_REPO}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        // Pin the API version and identify ourselves — GitHub rejects API
        // requests without a User-Agent.
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Veiller-MiniappSync",
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`GitHub releases request failed: ${response.status} ${response.statusText}`)
  }

  const releases = (await response.json()) as GithubRelease[]
  if (!Array.isArray(releases)) {
    throw new Error("GitHub releases response was not an array")
  }

  for (const release of releases) {
    if (release.draft) continue
    const asset = (release.assets ?? []).find((a) => isBundleAsset(a.name, source))
    if (asset) {
      return {
        packageName: source.packageName,
        version: bundleVersion(asset.name, release.tag_name),
        downloadUrl: asset.browser_download_url,
        assetName: asset.name,
      }
    }
  }
  return null
}

/** Download a bundle to the cache dir and return the local file URI. */
async function downloadBundle(bundle: ResolvedBundle): Promise<string> {
  const downloadDir = new Directory(Paths.cache, "veiller_miniapps")
  if (!downloadDir.exists) downloadDir.create()

  const safeName = bundle.assetName.replace(/[^a-z0-9._-]/gi, "_")
  const target = new File(downloadDir, safeName)
  // A leftover from an interrupted prior run would make downloadFileAsync throw.
  if (target.exists) target.delete()

  try {
    const output = await File.downloadFileAsync(bundle.downloadUrl, target, {idempotent: true})
    return output.uri
  } catch (error) {
    throw new Error(`bundle download failed: ${(error as Error)?.message ?? error}`)
  }
}

/** Installed result surfaced to callers (sync log + the store's update button). */
export interface InstalledBundle {
  packageName: string
  version: string
}

/**
 * Stages an on-demand install passes through, reported to the caller so the
 * store screen can tell the user what is happening (XERK-225). Each stage is a
 * network or disk step that can take seconds; without them the UI can only show
 * an undifferentiated spinner.
 */
export type InstallStage = "checking" | "downloading" | "installing"

/** Optional per-stage callback for on-demand installs. */
export type InstallProgress = (stage: InstallStage) => void

/** Download a resolved bundle and install it, replacing any prior version. */
async function installResolvedBundle(bundle: ResolvedBundle, onProgress?: InstallProgress): Promise<InstalledBundle> {
  onProgress?.("downloading")
  const zipUri = await downloadBundle(bundle)
  onProgress?.("installing")
  const result = await appRegistry.installFromLocalZip(zipUri, {
    releaseIdentity: {source: "github_release", releaseId: bundle.version},
  })
  if (result.is_error()) {
    throw result.error
  }
  return result.value
}

async function syncEntry(source: VeillerMiniappSource): Promise<void> {
  // Unchecked in the store (XERK-217): skip install AND update. An already
  // installed version is left on disk untouched — unchecking only pauses future
  // downloads, it does not uninstall.
  if (!isVeillerMiniappEnabled(source.packageName)) {
    console.log(`${LOG_TAG}: ${source.packageName} disabled in store — skipping install/update`)
    return
  }

  const bundle = await resolveLatestBundle(source)
  if (!bundle) {
    console.warn(`${LOG_TAG}: no miniapp bundle found in ${source.repo} releases for ${source.packageName}`)
    return
  }

  // Already installed at this version — nothing to download.
  if (appRegistry.getInstalledVersions(bundle.packageName).includes(bundle.version)) {
    console.log(`${LOG_TAG}: ${bundle.packageName}@${bundle.version} already installed`)
    return
  }

  console.log(`${LOG_TAG}: installing ${bundle.packageName}@${bundle.version} from ${source.repo}`)
  const installed = await installResolvedBundle(bundle)
  console.log(`${LOG_TAG}: installed ${installed.packageName}@${installed.version}`)
}

/**
 * Veiller's remote miniapp installer (XERK-214).
 *
 * The APK bundles no miniapps. On every startup this reads the repo list in
 * config/veillerMiniapps.ts and, for each entry, installs the latest bundle
 * published in that repo's GitHub Releases. Entirely best-effort: a repo being
 * unreachable, rate-limited, or missing an asset must never block boot — the
 * app simply runs with whatever versions are already on disk from a prior run.
 */
export const veillerMiniappSync = {
  async sync(): Promise<void> {
    for (const source of VEILLER_MINIAPPS) {
      try {
        await syncEntry(source)
      } catch (error) {
        console.warn(
          `${LOG_TAG}: failed to sync ${source.packageName} from ${source.repo}: ${(error as Error)?.message ?? error}`,
        )
      }
    }
  },

  /**
   * Resolve, download, and install the latest bundle for one source right now,
   * bypassing the enabled check and the already-installed skip. Backs the store
   * screen's explicit "Install"/"Update" button, where the user has asked for
   * this specific app regardless of its checkbox. Throws if the repo has no
   * bundle or the download/install fails.
   *
   * `onProgress` fires as the install moves between stages so the caller can
   * show what it is doing rather than an opaque spinner (XERK-225).
   */
  async installLatest(source: VeillerMiniappSource, onProgress?: InstallProgress): Promise<InstalledBundle> {
    onProgress?.("checking")
    const bundle = await resolveLatestBundle(source)
    if (!bundle) {
      throw new Error(`no miniapp bundle found in ${source.repo} releases`)
    }
    return installResolvedBundle(bundle, onProgress)
  },
}
