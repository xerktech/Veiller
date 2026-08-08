/**
 * VirtualGlasses — the simulator's stand-in for a pair of smart glasses.
 *
 * Two halves, matching the split on real hardware:
 *
 *   1. The **host half** (what `SceneRenderer` does on the phone): take the raw
 *      scene a miniapp passed to `session.display.render()`, run it through the
 *      REAL scene pipeline — `processScene` (clamp / budget / pixel-accurate
 *      wrap against the device profile) then `diffScene` (create/update/move/
 *      remove annotations) — and produce the `SceneFrame` that would cross the
 *      JS→native bridge.
 *
 *   2. The **device half** (what a smart-glasses client does with that frame):
 *      apply the annotations to a retained set of containers, so what we draw
 *      is the accumulated device state, not the last frame's payload. A bug in
 *      the diff (an element the host thinks is "unchanged" but the glasses
 *      never received) therefore shows up here as a stale lens — exactly as it
 *      would on hardware.
 *
 * Because both halves are the production code paths, the pixels below are the
 * pixels a G2 would light up, modulo font rasterisation.
 */

import {
  degradeScene,
  diffScene,
  processScene,
  SceneStore,
  type FrameElement,
  type SceneDisplayCapabilities,
  type SceneElementInput,
  type SceneFrame,
} from "../../../mobile/modules/engine/src/utils/display/scene/index"
import {TextMeasurer} from "../../../mobile/modules/engine/src/utils/display/measurer/TextMeasurer"
import type {DisplayProfile} from "../../../mobile/modules/engine/src/utils/display/profiles/types"

export type SceneView = "main" | "dashboard"

/** A device profile + capability pair the simulator can emulate. */
export interface GlassesModel {
  /** Human-readable name, e.g. "Even Realities G2". */
  name: string
  /** Value the miniapp sees in `session.capabilities`. */
  capabilities: Record<string, unknown>
  /** Scene-pipeline view of the same device. */
  scene: SceneDisplayCapabilities
  /** Text metrics (glyph widths, line height) used for wrapping + drawing. */
  profile: DisplayProfile
}

export interface RenderOutcome {
  /** null when the device has no display at all. */
  frame: SceneFrame | null
  degraded: boolean
  dropped: string[]
  /** Set when the device can't position elements and the scene degraded to a legacy layout. */
  legacyLayout?: {layoutType: string; [key: string]: unknown} | null
}

export class VirtualGlasses {
  private readonly store = new SceneStore()
  private readonly measurer: TextMeasurer
  /** Retained device state: view → element id → element (insertion-ordered). */
  private readonly retained = new Map<SceneView, Map<string, FrameElement>>()
  /** Monotonic counter so callers can tell "same pixels" from "redrawn". */
  private revision = 0

  constructor(public readonly model: GlassesModel) {
    this.measurer = new TextMeasurer(model.profile)
  }

  /** Everything currently lit on the given view, in draw order. */
  lens(view: SceneView = "main"): FrameElement[] {
    return [...(this.retained.get(view)?.values() ?? [])]
  }

  currentRevision(): number {
    return this.revision
  }

  /** Width in device pixels of a string, per the model's glyph table. */
  measure(text: string): number {
    return this.measurer.measureText(text)
  }

  /**
   * Host + device pass for one `display.render()` call.
   *
   * Mirrors `SceneRenderer.emitScene`: no display ⇒ nothing happens; a device
   * that can't position ⇒ the scene degrades to a legacy layout (reported, not
   * drawn as a scene); otherwise process → diff → commit → apply to the device.
   */
  render(appId: string, view: SceneView, elements: SceneElementInput[]): RenderOutcome {
    const caps = this.model.scene
    if (!caps.width || !caps.height) return {frame: null, degraded: false, dropped: []}

    if (!caps.canPosition) {
      const {layout, degraded, dropped} = degradeScene(elements)
      return {frame: null, degraded, dropped, legacyLayout: layout}
    }

    const processed = processScene(elements, caps, this.model.profile)
    const prevFrame = this.store.isBaselineStale(appId, view) ? [] : this.store.lastFrame(appId, view)
    const {elements: diffed, removed} = diffScene(
      prevFrame,
      processed.elements,
      this.store.nextSyntheticId(appId, view),
    )
    this.store.commit(appId, view, diffed)

    const frame: SceneFrame = {
      appId,
      view,
      sceneEpoch: this.store.currentEpoch(appId, view),
      elements: diffed,
      removed,
    }
    this.applyFrame(frame)
    return {frame, degraded: processed.degraded, dropped: processed.dropped}
  }

  /**
   * Apply a SceneFrame the way a smart-glasses client would: honour the
   * per-element change annotation against retained containers.
   *
   * "unchanged" deliberately does NOT redraw — that is the whole point of the
   * annotation, and it is why a stale diff baseline produces a blank lens on
   * hardware. If an "unchanged" element isn't already retained we drop it (and
   * count it), because the firmware has no container to update.
   */
  private applyFrame(frame: SceneFrame): void {
    if (frame.replay) this.retained.delete(frame.view)
    let containers = this.retained.get(frame.view)
    if (!containers) {
      containers = new Map()
      this.retained.set(frame.view, containers)
    }
    for (const el of frame.elements) {
      if (el.change === "unchanged" && !containers.has(el.id)) {
        // The host believed the device already had this element; it doesn't.
        // Nothing is drawn — this is the on-hardware symptom of a bad baseline.
        this.lostElements.push(`${frame.view}:${el.id}`)
        continue
      }
      if (el.change === "unchanged") continue
      containers.set(el.id, el)
    }
    for (const id of frame.removed) containers.delete(id)
    this.revision++
  }

  /** Elements the host marked "unchanged" that the device had never received. */
  readonly lostElements: string[] = []

  /** A system-level wipe of a view (duration expiry, app switch, unmount). */
  clearView(view: SceneView = "main"): void {
    this.retained.delete(view)
    this.store.markViewStale(view)
    this.revision++
  }

  /** Forget an app's retained scene entirely (app stop). */
  clearApp(appId: string): void {
    this.store.clear(appId)
  }

  // ===========================================================================
  // Renderers
  // ===========================================================================

  /**
   * A text picture of the lens, on a grid derived from the device's real
   * geometry: one column per space-width, one row per line-height. Positions
   * are the element boxes rounded onto that grid, so what lines up here lines
   * up on the glasses.
   */
  toText(view: SceneView = "main"): string {
    const {width, height} = this.model.scene
    const colPx = Math.max(1, this.measurer.measureText(" ") || 6)
    const rowPx = this.model.profile.lineHeightPx ?? 40
    const cols = Math.ceil(width / colPx)
    const rows = Math.ceil(height / rowPx)
    const grid: string[][] = Array.from({length: rows}, () => Array.from({length: cols}, () => " "))

    const put = (row: number, col: number, ch: string) => {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return
      grid[row][col] = ch
    }

    for (const el of this.lens(view)) {
      const x0 = Math.round(el.box.x / colPx)
      const y0 = Math.round(el.box.y / rowPx)
      const w = Math.max(1, Math.round(el.box.w / colPx))
      const h = Math.max(1, Math.round(el.box.h / rowPx))
      const border = (el.style as {border?: number} | undefined)?.border

      if (border) {
        for (let c = x0; c < x0 + w; c++) {
          put(y0, c, "─")
          put(y0 + h - 1, c, "─")
        }
        for (let r = y0; r < y0 + h; r++) {
          put(r, x0, "│")
          put(r, x0 + w - 1, "│")
        }
        put(y0, x0, "┌")
        put(y0, x0 + w - 1, "┐")
        put(y0 + h - 1, x0, "└")
        put(y0 + h - 1, x0 + w - 1, "┘")
      }

      if (el.type === "image") {
        for (let r = y0; r < y0 + h; r++) for (let c = x0; c < x0 + w; c++) put(r, c, "▒")
        continue
      }
      if (el.type !== "text" || !el.text) continue

      // Text is already host-wrapped; each line starts at the box's left edge
      // and advances by measured glyph width, which is how the firmware lays
      // a pre-wrapped string into its container.
      // Text is already host-wrapped against the real glyph widths, so the line
      // breaks below are the hardware's. Within a line the grid places one
      // character per cell from the box's left edge: a proportional font on a
      // fixed grid otherwise collides narrow glyphs into one cell. Boxes and
      // line positions stay true; only intra-line spacing is idealised.
      const lines = el.text.split("\n")
      const textLeft = border ? x0 + 1 : x0
      const textRight = border ? x0 + w - 1 : x0 + w
      lines.forEach((line, i) => {
        const row = y0 + i + (border ? 1 : 0)
        for (let c = 0; c < line.length && textLeft + c < textRight; c++) {
          put(row, textLeft + c, line[c])
        }
      })
    }

    const border = "+".padEnd(cols + 1, "-") + "+"
    const body = grid.map((row) => `|${row.join("")}|`).join("\n")
    return `${border}\n${body}\n${border}`
  }

  /**
   * A font size whose natural glyph advances land close to the device's, so
   * `textLength` only has to nudge the line rather than squash it. Derived from
   * the profile's own metrics: a typical sans face advances ≈0.55em per
   * lowercase glyph, so the size that matches an average advance is advance/0.55.
   */
  private svgFontSize(): number {
    const sample = "abcdefghijklmnopqrstuvwxyz"
    const average = this.measurer.measureText(sample) / sample.length
    const lineHeight = this.model.profile.lineHeightPx ?? 40
    return Math.max(8, Math.min(Math.round(average / 0.55), Math.round(lineHeight * 0.8)))
  }

  /** Scalable, pixel-positioned picture of the lens for the browser panel. */
  toSvg(view: SceneView = "main"): string {
    const {width, height} = this.model.scene
    const lineHeight = this.model.profile.lineHeightPx ?? 40
    const parts: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="glasses lens">`,
      `<rect x="0" y="0" width="${width}" height="${height}" fill="#04140a"/>`,
    ]

    for (const el of this.lens(view)) {
      const style = (el.style ?? {}) as {border?: number; radius?: number}
      if (style.border) {
        parts.push(
          `<rect x="${el.box.x + 0.5}" y="${el.box.y + 0.5}" width="${Math.max(0, el.box.w - 1)}" height="${Math.max(0, el.box.h - 1)}" rx="${style.radius ?? 0}" fill="none" stroke="#4dff9e" stroke-width="${style.border}"/>`,
        )
      }
      if (el.type === "image") {
        parts.push(
          `<image x="${el.box.x}" y="${el.box.y}" width="${el.box.w}" height="${el.box.h}" href="data:image/png;base64,${el.data ?? ""}" preserveAspectRatio="none"/>`,
        )
        continue
      }
      if (el.type !== "text" || !el.text) continue

      const pad = style.border ? style.border + 2 : 0
      const fontSize = this.svgFontSize()
      el.text.split("\n").forEach((line, i) => {
        if (!line) return
        // The browser has no copy of the firmware font, so instead of trusting
        // its advances we pin each line to the width the device would give it:
        // `textLength` is the measured width and `lengthAdjust` lets the
        // renderer stretch or squeeze to hit it. A line that wraps at column N
        // on the glasses therefore ends at the same x here.
        const y = el.box.y + pad + i * lineHeight + lineHeight * 0.72
        const width = this.measurer.measureText(line)
        parts.push(
          // xml:space="preserve" matters: miniapps right-align by padding with
          // spaces, and SVG's default whitespace collapsing would fold that
          // padding away — then textLength would stretch the visible glyphs
          // across the gap instead of leaving it blank.
          `<text xml:space="preserve" x="${el.box.x + pad}" y="${y.toFixed(1)}" textLength="${width.toFixed(1)}" lengthAdjust="spacingAndGlyphs" ` +
            `fill="#7dffb4" font-family="DejaVu Sans, Verdana, sans-serif" font-size="${fontSize}">${escapeXml(line)}</text>`,
        )
      })
    }

    parts.push("</svg>")
    return parts.join("")
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;",
  )
}
