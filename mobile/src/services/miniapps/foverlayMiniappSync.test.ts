/**
 * Unit tests for the Foverlay GitHub-release miniapp installer (XERK-214).
 *
 * The whole pipeline is mocked at its edges — the GitHub Releases API (fetch),
 * the on-disk registry (appRegistry), and the downloader (expo-file-system) —
 * so the tests exercise the resolution/skip/install decision logic, which is
 * where the real behavior lives. Asset names and tags mirror the actual
 * Turma/Tenir release pipelines (`<repo>-foverlay-v<version>.zip`).
 */

// Mutable so each test can set the repo list. Must be `mock`-prefixed to be
// referenceable inside the hoisted jest.mock factory.
import {foverlayMiniappSync} from "./foverlayMiniappSync"

let mockSources: Array<{repo: string; packageName: string; assetPattern?: string}> = []

jest.mock("@/config/foverlayMiniapps", () => ({
  get FOVERLAY_MINIAPPS() {
    return mockSources
  },
}))

const mockGetInstalledVersions = jest.fn<string[], [string]>()
const mockInstallFromLocalZip = jest.fn()
jest.mock("@mentra/engine/internal", () => ({
  appRegistry: {
    getInstalledVersions: (pkg: string) => mockGetInstalledVersions(pkg),
    installFromLocalZip: (uri: string, opts?: unknown) => mockInstallFromLocalZip(uri, opts),
  },
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
      this.uri = `file:///cache/foverlay_miniapps/${name}`
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
  mockInstallFromLocalZip.mockReset()
  mockDownloadFileAsync.mockReset()
  ;(global as any).fetch = jest.fn()
  jest.spyOn(console, "log").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("foverlayMiniappSync", () => {
  it("downloads and installs the latest release bundle when nothing is installed", async () => {
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([
        {tag: "v0.6.47", assets: ["manifest.json", "turma-android-v0.6.38.apk", "turma-foverlay-v0.6.47.zip"]},
      ]),
    )
    mockDownloadFileAsync.mockResolvedValue({uri: "file:///cache/foverlay_miniapps/turma-foverlay-v0.6.47.zip"})
    mockInstallFromLocalZip.mockResolvedValue(okResult("com.xerktech.turma", "0.6.47"))

    await foverlayMiniappSync.sync()

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/xerktech/Turma/releases?per_page=30",
      expect.objectContaining({headers: expect.objectContaining({Accept: "application/vnd.github+json"})}),
    )
    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      "https://example.test/turma-foverlay-v0.6.47.zip",
      expect.anything(),
      expect.objectContaining({idempotent: true}),
    )
    // Version is derived from the tag (v0.6.47 -> 0.6.47), matching miniapp.json.
    expect(mockInstallFromLocalZip).toHaveBeenCalledWith(
      "file:///cache/foverlay_miniapps/turma-foverlay-v0.6.47.zip",
      expect.objectContaining({
        releaseIdentity: expect.objectContaining({source: "github_release", releaseId: "0.6.47"}),
      }),
    )
  })

  it("skips download+install when that exact version is already installed", async () => {
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    mockGetInstalledVersions.mockReturnValue(["0.6.47"])
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v0.6.47", assets: ["turma-foverlay-v0.6.47.zip"]}]),
    )

    await foverlayMiniappSync.sync()

    expect(mockGetInstalledVersions).toHaveBeenCalledWith("com.xerktech.turma")
    expect(mockDownloadFileAsync).not.toHaveBeenCalled()
    expect(mockInstallFromLocalZip).not.toHaveBeenCalled()
  })

  it("picks the newest release that actually carries the foverlay bundle", async () => {
    // Mirrors the Turma repo: it cuts multiple release trains, and some (the
    // native-agent tarball) don't publish a foverlay bundle at all.
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([
        {tag: "agent-native-v0.6.46", assets: ["turma-agent-native-v0.6.46.tar.gz"]},
        {tag: "v0.6.47", assets: ["turma-foverlay-v0.6.47.zip", "manifest.json"]},
        {tag: "v0.6.46", assets: ["turma-foverlay-v0.6.46.zip"]},
      ]),
    )
    mockDownloadFileAsync.mockResolvedValue({uri: "file:///cache/foverlay_miniapps/turma-foverlay-v0.6.47.zip"})
    mockInstallFromLocalZip.mockResolvedValue(okResult("com.xerktech.turma", "0.6.47"))

    await foverlayMiniappSync.sync()

    expect(mockInstallFromLocalZip).toHaveBeenCalledTimes(1)
    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      "https://example.test/turma-foverlay-v0.6.47.zip",
      expect.anything(),
      expect.anything(),
    )
  })

  it("ignores .zip assets that aren't foverlay bundles", async () => {
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v0.6.47", assets: ["Source-code.zip", "turma-android-v0.6.38.apk"]}]),
    )

    await foverlayMiniappSync.sync()

    expect(mockInstallFromLocalZip).not.toHaveBeenCalled()
  })

  it("is best-effort: a failing repo does not stop later repos", async () => {
    mockSources = [
      {repo: "xerktech/Broken", packageName: "com.xerktech.broken"},
      {repo: "xerktech/Tenir", packageName: "com.xerktech.tenir"},
    ]
    ;(global.fetch as unknown as jest.Mock)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(releasesResponse([{tag: "v0.5.10", assets: ["tenir-foverlay-v0.5.10.zip"]}]))
    mockDownloadFileAsync.mockResolvedValue({uri: "file:///cache/foverlay_miniapps/tenir-foverlay-v0.5.10.zip"})
    mockInstallFromLocalZip.mockResolvedValue(okResult("com.xerktech.tenir", "0.5.10"))

    await expect(foverlayMiniappSync.sync()).resolves.toBeUndefined()

    expect(mockInstallFromLocalZip).toHaveBeenCalledTimes(1)
    expect(mockInstallFromLocalZip).toHaveBeenCalledWith(
      "file:///cache/foverlay_miniapps/tenir-foverlay-v0.5.10.zip",
      expect.anything(),
    )
  })

  it("logs (no throw) when a repo has no foverlay bundle in any release", async () => {
    mockSources = [{repo: "xerktech/Turma", packageName: "com.xerktech.turma"}]
    ;(global.fetch as unknown as jest.Mock).mockResolvedValue(
      releasesResponse([{tag: "v1", assets: ["something-else.tar.gz"]}]),
    )

    await expect(foverlayMiniappSync.sync()).resolves.toBeUndefined()
    expect(mockInstallFromLocalZip).not.toHaveBeenCalled()
  })
})
