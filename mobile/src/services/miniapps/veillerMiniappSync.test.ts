/**
 * Unit tests for the Veiller GitHub-release miniapp installer (XERK-214).
 *
 * The whole pipeline is mocked at its edges — the GitHub Releases API (fetch),
 * the on-disk registry (appRegistry), and the downloader (expo-file-system) —
 * so the tests exercise the resolution/skip/install decision logic, which is
 * where the real behavior lives. Asset names and tags mirror the actual
 * Turma/Tenir release pipelines (`<repo>-veiller-v<version>.zip`).
 */

// Mutable so each test can set the repo list. Must be `mock`-prefixed to be
// referenceable inside the hoisted jest.mock factory.
import {resolveLatestBundle, veillerMiniappSync} from "./veillerMiniappSync"

let mockSources: Array<{repo: string; packageName: string; assetPattern?: string}> = []

jest.mock("@/config/veillerMiniapps", () => ({
  get VEILLER_MINIAPPS() {
    return mockSources
  },
}))

const mockGetInstalledVersions = jest.fn<string[], [string]>()
const mockInstallFromLocalZip = jest.fn()
jest.mock("@veiller/engine/internal", () => ({
  appRegistry: {
    getInstalledVersions: (pkg: string) => mockGetInstalledVersions(pkg),
    installFromLocalZip: (uri: string, opts?: unknown) => mockInstallFromLocalZip(uri, opts),
  },
}))

// Store enable/disable state (XERK-217). Defaults to enabled; a test flips it to
// exercise the disabled-source skip.
const mockIsEnabled = jest.fn<boolean, [string]>()
jest.mock("@/services/miniapps/veillerMiniappPrefs", () => ({
  isVeillerMiniappEnabled: (pkg: string) => mockIsEnabled(pkg),
}))

const mockDownloadFileAsync = jest.fn()
jest.mock("expo-file-system", () => {
  class Directory {
    exists = true
    create() {}
  }
  class File {
    name: string
    uri: string
    exists = false
    constructor(_dir: unknown, name: string) {
      this.name = name
      this.uri = `file:///cache/veiller_miniapps/${name}`
    }
    delete() {}
    static downloadFileAsync(...args: unknown[]) {
      return mockDownloadFileAsync(...args)
    }
  }
  return {Directory, File, Paths: {cache: "/cache"}}
})

/** Build a GitHub Releases API payload (array, newest first). */
function releasesResponse(releases: Array<{tag?: string; draft?: boolean; prerelease?: boolean; assets: string[]}>) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () =>
      releases.map((r) => ({
        tag_name: r.tag ?? "v0.0.0",
        draft: r.draft ?? false,
        prerelease: r.prerelease ?? false,
        assets: r.assets.map((name) => ({
          name,
          browser_download_url: `https://example.test/${name}`,
        })),
      })),
  }
}

const okResult = (packageName: string, version: string) => ({
  is_error: () => false,
  is_ok: () => true,
  value: {packageName, version},
})

beforeEach(() => {
  mockSources = []
  mockGetInstalledVersions.mockReset().mockReturnValue([])
  mockIsEnabled.mockReset().mockReturnValue(true)
  mockInstallFromLocalZip.mockReset()
  mockDownloadFileAsync.mockReset()
  ;(global as any).fetch = jest.fn()
  jest.spyOn(console, "log").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("veillerMiniappSync", () => {
  it("downloads and installs the latest release bundle when nothing is installed", async () => {
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([
        {tag: "v0.6.47", assets: ["manifest.json", "turma-android-v0.6.38.apk", "turma-veiller-v0.6.47.zip"]},
      ]),
    )
    mockDownloadFileAsync.mockResolvedValue({uri: "file:///cache/veiller_miniapps/turma-veiller-v0.6.47.zip"})
    mockInstallFromLocalZip.mockResolvedValue(okResult("com.xerktech.turma", "0.6.47"))

    await veillerMiniappSync.sync()

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/xerktech/Turma/releases?per_page=30",
      expect.objectContaining({headers: expect.objectContaining({Accept: "application/vnd.github+json"})}),
    )
    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      "https://example.test/turma-veiller-v0.6.47.zip",
      expect.anything(),
      expect.objectContaining({idempotent: true}),
    )
    // Version is derived from the asset name, matching the bundle's miniapp.json.
    expect(mockInstallFromLocalZip).toHaveBeenCalledWith(
      "file:///cache/veiller_miniapps/turma-veiller-v0.6.47.zip",
      expect.objectContaining({
        releaseIdentity: expect.objectContaining({source: "github_release", releaseId: "0.6.47"}),
      }),
    )
  })

  it("skips download+install when that exact version is already installed", async () => {
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    mockGetInstalledVersions.mockReturnValue(["0.6.47"])
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v0.6.47", assets: ["turma-veiller-v0.6.47.zip"]}]),
    )

    await veillerMiniappSync.sync()

    expect(mockGetInstalledVersions).toHaveBeenCalledWith("com.xerktech.turma")
    expect(mockDownloadFileAsync).not.toHaveBeenCalled()
    expect(mockInstallFromLocalZip).not.toHaveBeenCalled()
  })

  it("skips a source that is disabled (unchecked) in the store", async () => {
    mockSources = [{repo: "xerktech/Tenir", packageName: "com.xerktech.tenir"}]
    mockIsEnabled.mockReturnValue(false)

    await veillerMiniappSync.sync()

    // Disabled sources are skipped before any network/registry work.
    expect(mockIsEnabled).toHaveBeenCalledWith("com.xerktech.tenir")
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockDownloadFileAsync).not.toHaveBeenCalled()
    expect(mockInstallFromLocalZip).not.toHaveBeenCalled()
  })

  it("installLatest installs even when the source is disabled and already installed", async () => {
    // The store's explicit Install/Update button bypasses both the enabled check
    // and the already-installed skip.
    const source = {repo: "xerktech/Turma", packageName: "com.xerktech.turma", name: "Turma"}
    mockIsEnabled.mockReturnValue(false)
    mockGetInstalledVersions.mockReturnValue(["0.6.46"])
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v0.6.47", assets: ["turma-veiller-v0.6.47.zip"]}]),
    )
    mockDownloadFileAsync.mockResolvedValue({uri: "file:///cache/veiller_miniapps/turma-veiller-v0.6.47.zip"})
    mockInstallFromLocalZip.mockResolvedValue(okResult("com.xerktech.turma", "0.6.47"))

    const result = await veillerMiniappSync.installLatest(source)

    expect(result).toEqual({packageName: "com.xerktech.turma", version: "0.6.47"})
    expect(mockInstallFromLocalZip).toHaveBeenCalledTimes(1)
  })

  it("picks the newest release that actually carries the veiller bundle", async () => {
    // Mirrors the Turma repo: it cuts multiple release trains, and some (the
    // native-agent tarball) don't publish a veiller bundle at all.
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([
        {tag: "agent-native-v0.6.46", assets: ["turma-agent-native-v0.6.46.tar.gz"]},
        {tag: "v0.6.47", assets: ["turma-veiller-v0.6.47.zip", "manifest.json"]},
        {tag: "v0.6.46", assets: ["turma-veiller-v0.6.46.zip"]},
      ]),
    )
    mockDownloadFileAsync.mockResolvedValue({uri: "file:///cache/veiller_miniapps/turma-veiller-v0.6.47.zip"})
    mockInstallFromLocalZip.mockResolvedValue(okResult("com.xerktech.turma", "0.6.47"))

    await veillerMiniappSync.sync()

    expect(mockInstallFromLocalZip).toHaveBeenCalledTimes(1)
    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      "https://example.test/turma-veiller-v0.6.47.zip",
      expect.anything(),
      expect.anything(),
    )
  })

  it("ignores .zip assets that aren't veiller bundles", async () => {
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v0.6.47", assets: ["Source-code.zip", "turma-android-v0.6.38.apk"]}]),
    )

    await veillerMiniappSync.sync()

    expect(mockInstallFromLocalZip).not.toHaveBeenCalled()
  })

  it("is best-effort: a failing repo does not stop later repos", async () => {
    mockSources = [
      {repo: "xerktech/Broken", packageName: "com.xerktech.broken"},
      {repo: "xerktech/Tenir", packageName: "com.xerktech.tenir"},
    ]
    ;(global.fetch as unknown as jest.Mock)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(releasesResponse([{tag: "v0.5.10", assets: ["tenir-veiller-v0.5.10.zip"]}]))
    mockDownloadFileAsync.mockResolvedValue({uri: "file:///cache/veiller_miniapps/tenir-veiller-v0.5.10.zip"})
    mockInstallFromLocalZip.mockResolvedValue(okResult("com.xerktech.tenir", "0.5.10"))

    await expect(veillerMiniappSync.sync()).resolves.toBeUndefined()

    expect(mockInstallFromLocalZip).toHaveBeenCalledTimes(1)
    expect(mockInstallFromLocalZip).toHaveBeenCalledWith(
      "file:///cache/veiller_miniapps/tenir-veiller-v0.5.10.zip",
      expect.anything(),
    )
  })

  it("takes the version from the asset name, not the release tag (XERK-225)", async () => {
    // Real shape from xerktech/Turma: releases are cut for every change, but the
    // previous bundle asset is re-attached when the miniapp itself didn't
    // change, so tag v0.6.57 ships turma-veiller-v0.6.53.zip (miniapp.json
    // 0.6.53). Trusting the tag reports a version that is never installed, so
    // the store shows a permanent "Update available" and the sync re-downloads
    // the same bundle every startup.
    const source = {repo: "xerktech/Turma", packageName: "com.xerktech.turma", name: "Turma"}
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v0.6.57", assets: ["turma-veiller-v0.6.53.zip"]}]),
    )

    const bundle = await resolveLatestBundle(source)

    expect(bundle).toEqual(expect.objectContaining({version: "0.6.53", assetName: "turma-veiller-v0.6.53.zip"}))
  })

  it("skips the re-download when the asset's version is already installed under a newer tag", async () => {
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    mockGetInstalledVersions.mockReturnValue(["0.6.53"])
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v0.6.57", assets: ["turma-veiller-v0.6.53.zip"]}]),
    )

    await veillerMiniappSync.sync()

    expect(mockDownloadFileAsync).not.toHaveBeenCalled()
    expect(mockInstallFromLocalZip).not.toHaveBeenCalled()
  })

  it("falls back to the tag when the asset name carries no version", async () => {
    const source = {repo: "xerktech/Other", packageName: "com.xerktech.other", name: "Other"}
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v1.2.3", assets: ["veiller-bundle.zip"]}]),
    )

    await expect(resolveLatestBundle(source)).resolves.toEqual(expect.objectContaining({version: "1.2.3"}))
  })

  it("reports each install stage so the store can show progress (XERK-225)", async () => {
    const source = {repo: "xerktech/Tenir", packageName: "com.xerktech.tenir", name: "Tenir"}
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v0.6.5", assets: ["tenir-veiller-v0.6.4.zip"]}]),
    )
    mockDownloadFileAsync.mockResolvedValue({uri: "file:///cache/veiller_miniapps/tenir-veiller-v0.6.4.zip"})
    mockInstallFromLocalZip.mockResolvedValue(okResult("com.xerktech.tenir", "0.6.4"))

    const stages: string[] = []
    const result = await veillerMiniappSync.installLatest(source, (stage) => stages.push(stage))

    expect(stages).toEqual(["checking", "downloading", "installing"])
    expect(result).toEqual({packageName: "com.xerktech.tenir", version: "0.6.4"})
  })

  it("surfaces a download failure to the caller so the store can report it", async () => {
    const source = {repo: "xerktech/Tenir", packageName: "com.xerktech.tenir", name: "Tenir"}
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v0.6.5", assets: ["tenir-veiller-v0.6.4.zip"]}]),
    )
    mockDownloadFileAsync.mockRejectedValue(new Error("connection reset"))

    await expect(veillerMiniappSync.installLatest(source)).rejects.toThrow(/connection reset/)
    expect(mockInstallFromLocalZip).not.toHaveBeenCalled()
  })

  it("logs (no throw) when a repo has no veiller bundle in any release", async () => {
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v1", assets: ["something-else.tar.gz"]}]),
    )

    await expect(veillerMiniappSync.sync()).resolves.toBeUndefined()
    expect(mockInstallFromLocalZip).not.toHaveBeenCalled()
  })
})
