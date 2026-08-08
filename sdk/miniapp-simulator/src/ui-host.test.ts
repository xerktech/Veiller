import {describe, expect, test} from "bun:test"

import {injectHostEnvironment} from "./ui-host"

const OPTS = {packageName: "com.veiller.fixture", socketPath: "/ws/ui"}

describe("injectHostEnvironment", () => {
  test("installs the globals a page expects before its own scripts run", () => {
    const html = `<!doctype html><html><head><script src="./app.js"></script></head><body></body></html>`
    const out = injectHostEnvironment(html, OPTS)
    expect(out.indexOf("window.Veiller")).toBeLessThan(out.indexOf("./app.js"))
    expect(out).toContain("com.veiller.fixture")
    expect(out).toContain("window.ReactNativeWebView")
    expect(out).toContain("window.veiller")
  })

  test("keeps the pre-rename aliases published bundles still use", () => {
    const out = injectHostEnvironment("<html><head></head><body></body></html>", OPTS)
    expect(out).toContain("window.Mentra = window.Veiller")
    expect(out).toContain("window.mentra = window.veiller")
    expect(out).toContain("--mentra-safe-top")
  })

  test("points the bridge at the socket it was given", () => {
    const out = injectHostEnvironment("<html><head></head></html>", {...OPTS, socketPath: "/custom"})
    expect(out).toContain('"/custom"')
  })

  test("handles a page with no <head>", () => {
    const out = injectHostEnvironment("<body>bare</body>", OPTS)
    expect(out).toContain("window.Veiller")
    expect(out).toContain("bare")
  })
})
