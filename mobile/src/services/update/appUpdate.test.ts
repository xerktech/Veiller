import {apkAssetVersion, compareVersions, latestApkUpdate, type ReleaseView} from "./appUpdate"

const release = (assets: string[], overrides: Partial<ReleaseView> = {}): ReleaseView => ({
  draft: false,
  prerelease: false,
  assets: assets.map((name) => ({name, downloadUrl: `https://example.test/${name}`})),
  ...overrides,
})

describe("apkAssetVersion", () => {
  it("extracts the version from a release APK name", () => {
    expect(apkAssetVersion("veiller-v0.3.2.apk")).toBe("0.3.2")
    expect(apkAssetVersion("  veiller-v1.10.0.apk  ")).toBe("1.10.0")
  })

  it("ignores the sibling mapping.txt and other assets", () => {
    // The release workflow attaches the R8 mapping next to the APK; matching it
    // would offer a 79 MB text file as an app update.
    expect(apkAssetVersion("veiller-v0.3.2-mapping.txt")).toBeNull()
    expect(apkAssetVersion("turma-veiller-v0.6.53.zip")).toBeNull()
    expect(apkAssetVersion("veiller.apk")).toBeNull()
    expect(apkAssetVersion("veiller-v0.3.apk")).toBeNull()
    expect(apkAssetVersion("foverlay-v0.2.6.apk")).toBeNull()
  })
})

describe("compareVersions", () => {
  it("orders by numeric component, not lexically", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0)
    expect(compareVersions("0.3.2", "0.3.10")).toBeLessThan(0)
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0)
  })

  it("treats missing components as zero", () => {
    expect(compareVersions("0.4", "0.4.0")).toBe(0)
    expect(compareVersions("0.4.1", "0.4")).toBeGreaterThan(0)
  })

  it("treats a non-numeric component as zero rather than throwing", () => {
    expect(compareVersions("dev", "0.0.0")).toBe(0)
    expect(compareVersions("0.3.2", "dev")).toBeGreaterThan(0)
  })
})

describe("latestApkUpdate", () => {
  it("offers a newer APK", () => {
    const update = latestApkUpdate([release(["veiller-v0.3.2.apk", "veiller-v0.3.2-mapping.txt"])], "0.3.1")
    expect(update).toEqual({version: "0.3.2", downloadUrl: "https://example.test/veiller-v0.3.2.apk"})
  })

  it("returns null when already current or ahead", () => {
    const releases = [release(["veiller-v0.3.2.apk"])]
    expect(latestApkUpdate(releases, "0.3.2")).toBeNull()
    expect(latestApkUpdate(releases, "0.4.0")).toBeNull()
  })

  it("picks the highest APK version across every release, not the newest release", () => {
    // The newest release can carry an older asset (the same carry-forward rule
    // the miniapp bundle sync handles, XERK-225), so scanning stops at neither
    // the first release nor the first APK.
    const update = latestApkUpdate(
      [release(["veiller-v0.3.1.apk"]), release(["veiller-v0.3.4.apk"]), release(["veiller-v0.3.3.apk"])],
      "0.3.0",
    )
    expect(update?.version).toBe("0.3.4")
  })

  it("skips drafts and prereleases", () => {
    const update = latestApkUpdate(
      [
        release(["veiller-v0.4.0.apk"], {draft: true}),
        release(["veiller-v0.3.9.apk"], {prerelease: true}),
        release(["veiller-v0.3.2.apk"]),
      ],
      "0.3.1",
    )
    expect(update?.version).toBe("0.3.2")
  })

  it("returns null when no release carries an APK", () => {
    expect(latestApkUpdate([release(["veiller-v0.3.2-mapping.txt"]), release([])], "0.3.1")).toBeNull()
  })
})
