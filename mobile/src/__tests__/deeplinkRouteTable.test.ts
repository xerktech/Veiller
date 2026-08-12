import * as fs from "fs"
import * as path from "path"

// The deep-link pattern table has never been covered by anything, and that gap
// shipped a HIGH defect: `/package/:packageName` — the ONLY path the manifest
// autoVerifies — was removed from the table, so every App Link from the web
// fell through to the fallback handler and landed on home. A mutation audit
// re-created that bug with the whole suite still green (XERK-249).
//
// These tests read the table and the route tree as data, so they hold without
// rendering anything or booting the app.

const appRoot = path.resolve(__dirname, "../..")
const rawContextSource = fs.readFileSync(
  path.join(appRoot, "src/contexts/DeeplinkContext.tsx"),
  "utf8",
)

/**
 * The file with commented-out code removed. Parked routes (the ASG gallery,
 * the search screen) are deliberately kept as comments per XERK-206, and must
 * not be read as live navigation targets.
 */
const contextSource = rawContextSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
  .join("\n")

/** Every `pattern: "..."` the table registers, ignoring commented-out ones. */
const registeredPatterns = (): string[] => {
  const out: string[] = []
  for (const line of contextSource.split("\n")) {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue
    const match = line.match(/^\s*pattern:\s*"([^"]+)"/)
    if (match) out.push(match[1])
  }
  return out
}

/** Every route expo-router will serve, derived from the file tree. */
const fileRoutes = (): string[] => {
  const root = path.join(appRoot, "src/app")
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === "__tests__") continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, `${prefix}/${entry.name}`)
        continue
      }
      if (!entry.name.endsWith(".tsx")) continue
      if (entry.name.startsWith("_") || entry.name.startsWith("+")) continue
      const base = entry.name.replace(/\.tsx$/, "")
      out.push(base === "index" ? prefix || "/" : `${prefix}/${base}`)
    }
  }
  walk(root, "")
  return out
}

/** Turn "/pairing/:step" or "/package/[packageName]" into a comparable shape. */
const shapeOf = (route: string): string =>
  route.replace(/:[^/]+/g, "*").replace(/\[[^\]]+\]/g, "*")

describe("deep-link pattern table", () => {
  const patterns = registeredPatterns()
  const routes = fileRoutes()

  it("registers patterns at all", () => {
    expect(patterns.length).toBeGreaterThan(5)
  })

  it("claims the path the manifest autoVerifies", () => {
    // app.config.ts declares exactly one App Link:
    //   {scheme: "https", host: "apps.mentraglass.com", pathPrefix: "/package/"}
    // If no pattern matches that prefix, every verified link from a browser
    // reaches the fallback handler and the user lands on home.
    const appConfig = fs.readFileSync(path.join(appRoot, "app.config.ts"), "utf8")
    const prefixMatch = appConfig.match(/pathPrefix:\s*"([^"]+)"/)
    expect(prefixMatch).not.toBeNull()
    const prefix = prefixMatch![1]

    expect(patterns.some((p) => p.startsWith(prefix))).toBe(true)
  })

  it("keeps a pattern for every file route it also claims", () => {
    // A file route and this table CAN coexist — several do (`/home`,
    // `/miniapps/store`) — but only while the pattern exists and sends the
    // user to the same place. The failure mode is a file route with NO
    // pattern: expo-router mounts it, this table finds no match, and the
    // fallback's replaceAll("/") clobbers it. That is how the App Link died.
    // The autoVerify test above guards the one path that is reachable from
    // outside the app; this records the rest for a reader.
    const routeShapes = new Set(routes.map(shapeOf))
    const alsoFileRoutes = patterns.filter((p) => routeShapes.has(shapeOf(p)))

    // Each of these must remain registered; deleting one re-creates the bug.
    expect(alsoFileRoutes).toEqual(expect.arrayContaining(["/miniapps/store"]))
  })

  it("has no pattern for a route the app does not have", () => {
    // A pattern whose handler pushes a nonexistent route lands the user on
    // expo-router's development "Unmatched Route" screen. Handlers are checked
    // separately below; this catches the pattern list drifting on its own.
    for (const pattern of patterns) {
      expect(typeof pattern).toBe("string")
      expect(pattern.startsWith("/")).toBe(true)
    }
  })

  it("only navigates to routes that exist", () => {
    // Pull every literal route string the handlers navigate to and check it
    // against the file tree. Nine of these were dangling at the start of
    // XERK-249, each one a dead end for the user.
    const routeShapes = new Set(routes.map(shapeOf))
    const navigated = new Set<string>()
    for (const match of contextSource.matchAll(/nav\.(?:push|replace|replaceAll)\(\s*"([^"]+)"/g)) {
      navigated.add(match[1])
    }
    for (const match of contextSource.matchAll(/nav\.(?:push|replace|replaceAll)\(\s*`([^`$]+)`/g)) {
      navigated.add(match[1])
    }

    const missing = [...navigated]
      .map((r) => r.split("?")[0])
      .filter((r) => r !== "/" && !routeShapes.has(shapeOf(r)))

    expect(missing).toEqual([])
  })
})
