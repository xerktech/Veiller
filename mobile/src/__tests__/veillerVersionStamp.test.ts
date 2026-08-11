import * as fs from "fs"
import * as path from "path"

// The in-app updater (XERK-232) compares EXPO_PUBLIC_VEILLER_VERSION against
// the version in a release asset's filename. `.env.example` had drifted to
// 3.0.0 while the release train was 0.3.x, so every build made from it —
// which mobile/AGENTS.md says is every CI staging build, since they `cp
// .env.example .env` — considered itself newer than every published APK and
// the update banner could never appear. The picking logic was fine; the stamp
// was wrong, and nothing noticed because nothing compared the two.

const repoRoot = path.resolve(__dirname, "../../..")

const readEnvExample = (): Record<string, string> => {
  const raw = fs.readFileSync(path.join(repoRoot, "mobile/.env.example"), "utf8")
  const out: Record<string, string> = {}
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

describe("EXPO_PUBLIC_VEILLER_VERSION in .env.example", () => {
  const env = readEnvExample()
  const version = env.EXPO_PUBLIC_VEILLER_VERSION

  it("is set", () => {
    expect(version).toBeTruthy()
  })

  it("is a plain semver triple", () => {
    // The updater compares against `veiller-v<version>.apk`, so anything the
    // release asset name cannot carry is wrong here.
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("sits on the release train named by the root VERSION file", () => {
    // Root VERSION holds the minor train ("0.3"); releases append a patch
    // ("v0.3.3"). A stamp on a different train means the updater is comparing
    // against a series that does not exist.
    const train = fs.readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim()
    expect(train).toMatch(/^\d+\.\d+$/)
    expect(version.startsWith(`${train}.`)).toBe(true)
  })
})
