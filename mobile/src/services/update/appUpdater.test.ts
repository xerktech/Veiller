/**
 * Unit tests for the in-app self-updater's state machine (XERK-232).
 *
 * The edges are mocked — the GitHub Releases API (fetch) and the download /
 * install side (expo-file-system, expo-intent-launcher) — so what these
 * exercise is the decision logic: when a banner appears, when a dismissal
 * silences it, and when a check is skipped entirely. Downloading and installing
 * are the parts that only a real device can prove, so they are deliberately not
 * asserted here.
 */

import {Platform} from "react-native"

jest.mock("expo-application", () => ({applicationId: "com.xerktech.veiller"}))

jest.mock("expo-file-system", () => ({
  Directory: class {
    exists = true
    create() {}
    list() {
      return []
    }
  },
  File: class {
    uri = "file:///cache/app_update/veiller.apk"
    contentUri = "content://com.xerktech.veiller.FileSystemFileProvider/veiller.apk"
    delete() {}
  },
  Paths: {cache: "/cache"},
}))

jest.mock("expo-file-system/legacy", () => ({createDownloadResumable: jest.fn()}))

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: jest.fn(async () => ({resultCode: 1})),
  ActivityAction: {MANAGE_UNKNOWN_APP_SOURCES: "android.settings.MANAGE_UNKNOWN_APP_SOURCES"},
}))

/** Build a GitHub Releases API payload (array, newest first). */
function releasesResponse(releases: Array<{draft?: boolean; prerelease?: boolean; assets: string[]}>) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () =>
      releases.map((r) => ({
        draft: r.draft ?? false,
        prerelease: r.prerelease ?? false,
        assets: r.assets.map((name) => ({
          name,
          browser_download_url: `https://github.test/${name}`,
        })),
      })),
  }
}

/**
 * A fresh updater per test — it is a module-level singleton holding throttle and
 * dismissal state, and each case needs its own.
 */
function freshUpdater() {
  let updater: typeof import("./appUpdater").appUpdater
  jest.isolateModules(() => {
    updater = require("./appUpdater").appUpdater
  })
  return updater!
}

const originalPlatform = Platform.OS
const originalVersion = process.env.EXPO_PUBLIC_VEILLER_VERSION

/** Let the check's floating promise chain settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
  Object.defineProperty(Platform, "OS", {value: "android", configurable: true})
  process.env.EXPO_PUBLIC_VEILLER_VERSION = "0.3.1"
  global.fetch = jest.fn(async () => releasesResponse([{assets: ["veiller-v0.3.2.apk"]}])) as unknown as typeof fetch
})

afterEach(() => {
  Object.defineProperty(Platform, "OS", {value: originalPlatform, configurable: true})
  process.env.EXPO_PUBLIC_VEILLER_VERSION = originalVersion
  jest.restoreAllMocks()
})

describe("appUpdater.check", () => {
  it("offers a newer release", async () => {
    const updater = freshUpdater()
    expect(updater.getState()).toEqual({kind: "hidden"})

    updater.check()
    await flush()

    expect(updater.getState()).toEqual({kind: "available", version: "0.3.2"})
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/xerktech/Veiller/releases?per_page=20",
      expect.anything(),
    )
  })

  it("stays hidden when the installed build is already current", async () => {
    process.env.EXPO_PUBLIC_VEILLER_VERSION = "0.3.2"
    const updater = freshUpdater()

    updater.check()
    await flush()

    expect(updater.getState()).toEqual({kind: "hidden"})
  })

  it("stays hidden — and quiet — when GitHub is unreachable", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down")
    }) as unknown as typeof fetch
    const updater = freshUpdater()

    updater.check()
    await flush()

    expect(updater.getState()).toEqual({kind: "hidden"})
  })

  it("does nothing off Android", async () => {
    Object.defineProperty(Platform, "OS", {value: "ios", configurable: true})
    const updater = freshUpdater()

    updater.check()
    await flush()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(updater.getState()).toEqual({kind: "hidden"})
  })

  it("does nothing when the build carries no stamped version", async () => {
    delete process.env.EXPO_PUBLIC_VEILLER_VERSION
    const updater = freshUpdater()

    updater.check()
    await flush()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(updater.getState()).toEqual({kind: "hidden"})
  })

  it("throttles repeat checks, but honors a forced one", async () => {
    const updater = freshUpdater()

    updater.check()
    await flush()
    updater.check()
    await flush()
    expect(global.fetch).toHaveBeenCalledTimes(1)

    updater.check(true)
    await flush()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})

describe("appUpdater.dismiss", () => {
  it("silences the dismissed version but resurfaces for a newer one", async () => {
    const updater = freshUpdater()

    updater.check()
    await flush()
    expect(updater.getState()).toEqual({kind: "available", version: "0.3.2"})

    updater.dismiss()
    expect(updater.getState()).toEqual({kind: "hidden"})

    // Same version on the next check: still hidden.
    updater.check(true)
    await flush()
    expect(updater.getState()).toEqual({kind: "hidden"})

    // A newer release breaks through the dismissal.
    global.fetch = jest.fn(async () => releasesResponse([{assets: ["veiller-v0.3.3.apk"]}])) as unknown as typeof fetch
    updater.check(true)
    await flush()
    expect(updater.getState()).toEqual({kind: "available", version: "0.3.3"})
  })
})
