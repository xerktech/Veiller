import {describe, expect, test} from "bun:test"

import {VirtualGlasses} from "./glasses"
import {resolveModel} from "./models"

function g2(): VirtualGlasses {
  return new VirtualGlasses(resolveModel("g2"))
}

describe("VirtualGlasses — the host half", () => {
  test("emulates the G2's real canvas", () => {
    const glasses = g2()
    expect(glasses.model.scene.width).toBe(576)
    expect(glasses.model.scene.height).toBe(288)
    expect(glasses.model.scene.canPosition).toBe(true)
  })

  test("first render creates every element", () => {
    const glasses = g2()
    const out = glasses.render("app", "main", [
      {type: "text", id: "status", box: {x: 0, y: 0, w: 300, h: 40}, text: "listening"},
    ])
    expect(out.frame?.elements.map((e) => e.change)).toEqual(["created"])
    expect(glasses.lens()).toHaveLength(1)
  })

  test("re-rendering identical content diffs to unchanged and leaves the lens alone", () => {
    const glasses = g2()
    const scene = [{type: "text" as const, id: "status", box: {x: 0, y: 0, w: 300, h: 40}, text: "listening"}]
    glasses.render("app", "main", scene)
    const second = glasses.render("app", "main", scene)
    expect(second.frame?.elements.map((e) => e.change)).toEqual(["unchanged"])
    expect(glasses.lens()[0].text).toBe("listening")
  })

  test("changing text updates in place, keeping the element id stable", () => {
    const glasses = g2()
    glasses.render("app", "main", [
      {type: "text", id: "status", box: {x: 0, y: 0, w: 300, h: 40}, text: "listening"},
    ])
    const out = glasses.render("app", "main", [
      {type: "text", id: "status", box: {x: 0, y: 0, w: 300, h: 40}, text: "connecting"},
    ])
    expect(out.frame?.elements[0].change).toBe("updated")
    expect(out.frame?.elements[0].id).toBe("status")
    expect(glasses.lens()[0].text).toBe("connecting")
  })

  test("an element the app stops sending is removed from the lens", () => {
    const glasses = g2()
    glasses.render("app", "main", [
      {type: "text", id: "a", box: {x: 0, y: 0, w: 200, h: 40}, text: "one"},
      {type: "text", id: "b", box: {x: 0, y: 40, w: 200, h: 40}, text: "two"},
    ])
    glasses.render("app", "main", [{type: "text", id: "a", box: {x: 0, y: 0, w: 200, h: 40}, text: "one"}])
    expect(glasses.lens().map((e) => e.id)).toEqual(["a"])
  })

  test("render([]) clears the lens", () => {
    const glasses = g2()
    glasses.render("app", "main", [{type: "text", id: "a", box: {x: 0, y: 0, w: 200, h: 40}, text: "one"}])
    glasses.render("app", "main", [])
    expect(glasses.lens()).toHaveLength(0)
  })

  test("text wraps against the device's real glyph widths", () => {
    const glasses = g2()
    glasses.render("app", "main", [
      {
        type: "text",
        id: "band",
        box: {x: 0, y: 0, w: 200, h: 200},
        text: "The quick brown fox jumps over the lazy dog",
      },
    ])
    const lines = (glasses.lens()[0].text ?? "").split("\n")
    expect(lines.length).toBeGreaterThan(1)
    // Nothing the host emits may be wider than the box it was wrapped into.
    for (const line of lines) expect(line.length).toBeLessThan(40)
  })

  test("elements past the device's container budget are dropped and reported", () => {
    const glasses = g2()
    const scene = Array.from({length: 9}, (_, i) => ({
      type: "text" as const,
      id: `t${i}`,
      box: {x: 0, y: i * 30, w: 100, h: 28},
      text: `line ${i}`,
    }))
    const out = glasses.render("app", "main", scene)
    expect(out.degraded).toBe(true)
    expect(out.dropped.length).toBe(9 - glasses.model.scene.maxTextElements)
    expect(glasses.lens().length).toBe(glasses.model.scene.maxTextElements)
  })

  test("a box hanging off the canvas is clamped, not rejected", () => {
    const glasses = g2()
    const out = glasses.render("app", "main", [
      {type: "text", id: "wide", box: {x: 400, y: 0, w: 400, h: 40}, text: "hi"},
    ])
    expect(out.degraded).toBe(true)
    expect(glasses.lens()[0].box).toEqual({x: 400, y: 0, w: 176, h: 40})
  })
})

describe("VirtualGlasses — the device half", () => {
  test("after a system clear, the next render repaints instead of diffing to nothing", () => {
    const glasses = g2()
    const scene = [{type: "text" as const, id: "status", box: {x: 0, y: 0, w: 300, h: 40}, text: "listening"}]
    glasses.render("app", "main", scene)
    // What a duration expiry / app switch does to the glasses.
    glasses.clearView("main")
    expect(glasses.lens()).toHaveLength(0)

    glasses.render("app", "main", scene)
    expect(glasses.lens()).toHaveLength(1)
    expect(glasses.lostElements).toEqual([])
  })
})

describe("VirtualGlasses — renderers", () => {
  test("the text view puts elements on the device's own grid", () => {
    const glasses = g2()
    glasses.render("app", "main", [
      {type: "text", id: "status", box: {x: 0, y: 0, w: 300, h: 40}, text: "listening"},
      {type: "text", id: "clock", box: {x: 460, y: 0, w: 116, h: 40}, text: "10:04"},
    ])
    const rows = glasses.toText().split("\n")
    // Row 0 is the frame border; row 1 is the first 40px line of the display.
    expect(rows[1]).toContain("listening")
    expect(rows[1]).toContain("10:04")
    expect(rows[1].indexOf("listening")).toBeLessThan(rows[1].indexOf("10:04"))
  })

  test("a bordered element draws as a box", () => {
    const glasses = g2()
    glasses.render("app", "main", [
      {type: "text", id: "cue", box: {x: 0, y: 0, w: 576, h: 120}, text: "Distance", style: {border: 2}},
    ])
    expect(glasses.toText()).toContain("┌")
    expect(glasses.toText()).toContain("┘")
  })

  test("the SVG view is self-contained and sized to the device", () => {
    const glasses = g2()
    glasses.render("app", "main", [
      {type: "text", id: "status", box: {x: 0, y: 0, w: 300, h: 40}, text: "listening"},
    ])
    const svg = glasses.toSvg()
    expect(svg).toContain('viewBox="0 0 576 288"')
    expect(svg).toContain(">listening</text>")
    // Each line is pinned to the width the device would give it.
    expect(svg).toContain(`textLength="${glasses.measure("listening").toFixed(1)}"`)
    // Nothing to fetch and nothing to execute: the panel embeds this inline.
    expect(svg).not.toContain("<script")
    expect(svg).not.toContain('href="http')
  })

  test("space padding survives into the SVG, so right-aligned text stays right", () => {
    const glasses = g2()
    glasses.render("app", "main", [
      {type: "text", id: "row", box: {x: 0, y: 0, w: 576, h: 40}, text: "Distance          10s"},
    ])
    const svg = glasses.toSvg()
    expect(svg).toContain('xml:space="preserve"')
    expect(svg).toContain("Distance          10s")
  })

  test("text with XML-significant characters is escaped", () => {
    const glasses = g2()
    glasses.render("app", "main", [
      {type: "text", id: "t", box: {x: 0, y: 0, w: 500, h: 40}, text: "a<b & c>d"},
    ])
    const svg = glasses.toSvg()
    expect(svg).toContain("&lt;")
    expect(svg).toContain("&amp;")
    expect(svg).toContain("&gt;")
  })
})
