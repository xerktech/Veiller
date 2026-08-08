/**
 * In-app self-updater for the Veiller Android app (XERK-232).
 *
 * Veiller is sideloaded — there is no Play Store channel — so a published
 * release only reaches a phone if the phone goes and gets it. This is the
 * Turma updater (`net/Updater.kt`) ported to React Native: poll the public
 * GitHub Releases of this repo, and when a `veiller-v<version>.apk` newer than
 * the running build shows up, offer it in a banner that downloads the APK and
 * hands it to the system package installer.
 *
 * Android only. iOS ships through TestFlight/the App Store, which owns its own
 * update path, so every entry point here no-ops off Android.
 *
 * Anonymous HTTPS against api.github.com — no token, no credential. That works
 * because xerktech/Veiller is a public repo, exactly like the miniapp bundle
 * sync in `services/miniapps/veillerMiniappSync.ts`. If the repo ever goes
 * private again, this check silently 404s and the banner simply never appears.
 *
 * The pure picking/compare logic lives in `appUpdate.ts`; this half is the I/O
 * and the state machine.
 */

import * as Application from "expo-application"
import {File, Paths, Directory} from "expo-file-system"
// The modern expo-file-system API has no download-progress callback, and the
// Veiller APK is ~130 MB — far too long to sit behind an undifferentiated
// spinner. `createDownloadResumable` is the only API that reports bytes, so the
// download (and only the download) uses the legacy entry point.
import {createDownloadResumable} from "expo-file-system/legacy"
import * as IntentLauncher from "expo-intent-launcher"
import {Platform} from "react-native"

import {latestApkUpdate, type AvailableUpdate, type ReleaseView} from "./appUpdate"

const LOG_TAG = "AppUpdater"

/** The repo whose Releases publish the Veiller APK (see .github/workflows/release.yml). */
const REPO = "xerktech/Veiller"

/** Releases scanned per check, newest first. */
const RELEASES_PAGE = 20

/** How long to wait on the GitHub API before giving up. */
const API_TIMEOUT_MS = 15_000

/**
 * Minimum gap between network checks. `check()` is called on every home-screen
 * focus and every foreground, so it has to be cheap to call; 15 minutes matches
 * Turma and keeps a freshly published release at most that far away.
 */
const CHECK_THROTTLE_MS = 15 * 60 * 1000

/** Cache subdirectory holding the one APK we are installing right now. */
const UPDATE_DIR = "app_update"

/** `Intent.FLAG_GRANT_READ_URI_PERMISSION` — the installer must read our content:// URI. */
const FLAG_GRANT_READ_URI_PERMISSION = 0x1

/** Minimal shape of the pieces of the GitHub Releases API we consume. */
interface GithubReleaseAsset {
  name: string
  browser_download_url: string
}
interface GithubRelease {
  draft: boolean
  prerelease: boolean
  assets: GithubReleaseAsset[]
}

/**
 * What the banner renders. `hidden` covers every uninteresting case at once:
 * not checked yet, up to date, offline, not Android, or dismissed.
 */
export type UpdateState =
  | {kind: "hidden"}
  | {kind: "available"; version: string}
  | {kind: "downloading"; version: string; pct: number | null}
  /**
   * Downloaded and handed to the system installer. The banner stays up as a
   * re-tap: the user can back out of the installer, or be told by Android that
   * it needs "install unknown apps" permission first, and either way the next
   * tap re-launches the install.
   */
  | {kind: "readyToInstall"; version: string}
  | {kind: "failed"; version: string | null; message: string}

const HIDDEN: UpdateState = {kind: "hidden"}

type Listener = () => void

/** The running build's versionName, stamped into .env by the release workflow. */
function installedVersion(): string | null {
  return process.env.EXPO_PUBLIC_VEILLER_VERSION || null
}

class AppUpdater {
  private state: UpdateState = HIDDEN
  private listeners = new Set<Listener>()

  private pending: AvailableUpdate | null = null
  private downloaded: File | null = null

  /**
   * Session-scoped: a version the user dismissed stays hidden until a still
   * newer one appears. Deliberately not persisted — "checks frequently" means
   * it resurfaces next launch, which is the reminder the ticket asks for.
   */
  private dismissedVersion: string | null = null

  private checking = false
  private lastCheckAt = 0
  /** True while the system installer is on screen (see {@link install}). */
  private installing = false

  // ---------------------------------------------------------------- store ----

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = (): UpdateState => this.state

  private setState(next: UpdateState) {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  /** Only a check may overwrite these; an in-flight download/install must not be clobbered. */
  private isIdle(): boolean {
    return this.state.kind === "hidden" || this.state.kind === "available"
  }

  // --------------------------------------------------------------- checks ----

  /**
   * Check for a newer APK. Throttled to {@link CHECK_THROTTLE_MS} so it is
   * cheap to call on every screen focus and foreground; pass `force` for an
   * explicit "check now". Stays quiet on failure (offline, rate-limited, repo
   * unreachable) — an update banner should never turn into an error nag — so
   * the state is left alone and the reason is logged.
   */
  check = (force = false): void => {
    if (Platform.OS !== "android") return
    const now = Date.now()
    if (!force && (this.checking || now - this.lastCheckAt < CHECK_THROTTLE_MS)) return

    const installed = installedVersion()
    if (!installed) {
      // A build with no stamped version (local dev) has nothing meaningful to
      // compare against; offering it "0.3.2" would be noise, not an update.
      console.log(`${LOG_TAG}: no EXPO_PUBLIC_VEILLER_VERSION — skipping update check`)
      return
    }

    this.checking = true
    this.lastCheckAt = now
    void (async () => {
      try {
        const update = await fetchLatest(installed)
        if (!update || update.version === this.dismissedVersion) {
          if (this.isIdle()) this.setState(HIDDEN)
        } else {
          this.pending = update
          if (this.isIdle()) this.setState({kind: "available", version: update.version})
        }
      } catch (error) {
        console.log(`${LOG_TAG}: update check failed: ${(error as Error)?.message ?? error}`)
      } finally {
        this.checking = false
      }
    })()
  }

  /** Hide the current offer for this session (until a newer version turns up). */
  dismiss = (): void => {
    if (this.state.kind === "available") this.dismissedVersion = this.state.version
    this.setState(HIDDEN)
  }

  /**
   * The banner's action button. Branches on the current state: download +
   * install a freshly-offered update, re-launch the installer for one already
   * downloaded, or retry a failure.
   */
  act = (): void => {
    switch (this.state.kind) {
      case "available":
      case "failed":
        if (this.pending) void this.startDownload(this.pending)
        break
      case "readyToInstall":
        if (this.downloaded) void this.install(this.state.version, this.downloaded)
        break
      default:
        break
    }
  }

  // ------------------------------------------------------- download/install --

  private async startDownload(update: AvailableUpdate): Promise<void> {
    this.setState({kind: "downloading", version: update.version, pct: null})
    let file: File
    try {
      file = await this.download(update)
    } catch (error) {
      console.warn(`${LOG_TAG}: update download failed: ${(error as Error)?.message ?? error}`)
      this.setState({kind: "failed", version: update.version, message: "Download failed"})
      return
    }
    this.downloaded = file
    await this.install(update.version, file)
  }

  private async download(update: AvailableUpdate): Promise<File> {
    const dir = new Directory(Paths.cache, UPDATE_DIR)
    if (!dir.exists) dir.create({intermediates: true})
    // Only ever keep the one APK we're installing now — these are ~130 MB.
    for (const entry of dir.list()) {
      if (entry instanceof File && entry.name.endsWith(".apk")) entry.delete()
    }

    const target = new File(dir, `veiller-${update.version}.apk`)
    let lastPct = -1
    const task = createDownloadResumable(
      update.downloadUrl,
      target.uri,
      {},
      ({totalBytesWritten, totalBytesExpectedToWrite}) => {
        if (totalBytesExpectedToWrite <= 0) return
        const pct = Math.floor((totalBytesWritten * 100) / totalBytesExpectedToWrite)
        if (pct === lastPct) return
        lastPct = pct
        // A re-check that landed mid-download must not steal the banner back.
        if (this.state.kind === "downloading") {
          this.setState({kind: "downloading", version: update.version, pct})
        }
      },
    )

    const result = await task.downloadAsync()
    if (!result) throw new Error("download produced no file")
    if (result.status !== 200) throw new Error(`HTTP ${result.status}`)
    return new File(result.uri)
  }

  /**
   * Hand the APK to the system installer. The OS verifies the signature on
   * install, which is the real integrity gate for replacing an already-installed
   * app — every Veiller release is signed with the same certificate, so the
   * update lands in place.
   *
   * On API 26+ the user must have granted Veiller "install unknown apps". We
   * cannot query that from JS, so we launch the install regardless: Android
   * itself then explains the block and offers the settings shortcut, and the
   * banner stays on `readyToInstall` so the tap after granting installs. If the
   * installer can't be opened at all, offer the direct settings route.
   */
  private async install(version: string, file: File): Promise<void> {
    this.setState({kind: "readyToInstall", version})
    // The installer is already on screen — a second tap would only make
    // IntentLauncher reject with "activity already started".
    if (this.installing) return
    this.installing = true
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
        data: file.contentUri,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      })
    } catch (error) {
      console.warn(`${LOG_TAG}: install intent failed: ${(error as Error)?.message ?? error}`)
      await this.openInstallPermissionSettings()
    } finally {
      this.installing = false
    }
  }

  /** Send the user to Settings → "Install unknown apps" for Veiller. */
  private async openInstallPermissionSettings(): Promise<void> {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
        data: `package:${Application.applicationId}`,
      })
    } catch (error) {
      console.warn(`${LOG_TAG}: could not open install-permission settings: ${(error as Error)?.message ?? error}`)
    }
  }
}

/** Fetch the release list and pick the newest APK newer than `installed`. */
async function fetchLatest(installed: string): Promise<AvailableUpdate | null> {
  const url = `https://api.github.com/repos/${REPO}/releases?per_page=${RELEASES_PAGE}`
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
        "User-Agent": "Veiller-AppUpdater",
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
  if (!Array.isArray(releases)) throw new Error("GitHub releases response was not an array")

  const views: ReleaseView[] = releases.map((release) => ({
    draft: !!release.draft,
    prerelease: !!release.prerelease,
    assets: (release.assets ?? []).map((asset) => ({
      name: asset.name,
      downloadUrl: asset.browser_download_url,
    })),
  }))
  return latestApkUpdate(views, installed)
}

/** App-global updater, mirroring Turma's single `container.updater`. */
export const appUpdater = new AppUpdater()
