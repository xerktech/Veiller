/**
 * Tap Typing Demo — background JSContext entry.
 *
 * Proves the chain end to end: Tap Strap 2 chord → TapInputService (native,
 * Controller Mode) → engine DeviceEventRouter → "tap_input" stream → this
 * miniapp → session.display.render → G2 text box. Phone screen off, in pocket.
 *
 * Deliberately trivial: maintain a text buffer, echo a trailing window of it
 * to the glasses, log keystroke→display latency. Nothing else.
 */

import {registerMiniapp} from "@mentra/miniapp/background"
import type {MiniappSession, TapInputData} from "@mentra/miniapp/background"

/**
 * Render coalescing interval. The native G2 driver already paces and
 * last-wins-coalesces BLE writes (EvenHub queue), so this throttle is about
 * not flooding the JS→native display path with one render per keystroke at
 * fast typing speeds, not about protecting the BLE link itself.
 */
const RENDER_INTERVAL_MS = 90

/**
 * Trailing window geometry. The G2 text-wall path fits ~7 lines of ~30 chars
 * at the firmware font's calibrated 40px line height on the 576x288 canvas
 * (mobile/modules/engine/src/utils/display/profiles/g2.ts). We wrap and clip
 * ourselves because the host's own wrapper clips from the TOP of the text —
 * it would show the oldest lines, and a typing echo needs the newest.
 */
const MAX_COLS = 30
const MAX_ROWS = 5

const CURSOR = "_"

class TapTypingController {
  private buffer = ""
  private renderTimer: ReturnType<typeof setTimeout> | null = null
  private lastRendered = ""
  private pendingSince: number | null = null // oldest un-rendered keystroke, for latency logging
  private pendingCount = 0

  constructor(private readonly session: MiniappSession) {}

  start(): void {
    this.session.input.onTapInput((event) => this.onTap(event))
    // Milestone-2 static proof: visible text on the G2 before any input flows.
    this.render("Tap Typing Demo ready" + "\n" + CURSOR)
    console.log("[tap-typing] started, waiting for tap_input events")
  }

  private onTap(event: TapInputData): void {
    switch (event.action) {
      case "char":
        this.buffer += event.char ?? ""
        break
      case "backspace":
        this.buffer = this.buffer.slice(0, -1)
        break
      case "shift":
      case "switch":
        // Layers are out of scope for the demo — log and move on.
        console.log(`[tap-typing] ${event.action} chord ignored (layers stubbed)`)
        return
      case "unmapped":
        console.log(`[tap-typing] unmapped tapcode=${event.tapcode} repeat=${event.repeat}`)
        return
    }

    if (this.pendingSince === null) this.pendingSince = event.timestamp
    this.pendingCount++
    this.scheduleRender()
  }

  /**
   * Coalesce renders on a timer instead of calling the display per keystroke;
   * at 60+ WPM chords arrive every ~150ms and bursts (double taps) faster.
   */
  private scheduleRender(): void {
    if (this.renderTimer !== null) return
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null
      this.flush()
    }, RENDER_INTERVAL_MS)
  }

  private flush(): void {
    const text = this.trailingWindow() + CURSOR
    const oldest = this.pendingSince
    const count = this.pendingCount
    this.pendingSince = null
    this.pendingCount = 0

    // Skip the display call entirely if nothing visible changed (e.g. a
    // backspace at an empty buffer, or unmapped chords only).
    if (text === this.lastRendered) return
    this.lastRendered = text

    this.render(text)

    // Latency instrumentation (milestone 7): native SDK callback timestamp →
    // this display call. The BLE leg to the glass adds on top of this; see the
    // README for how the numbers combine.
    if (oldest !== null) {
      const delta = Date.now() - oldest
      console.log(`[tap-typing] latency keystroke->display-call ${delta}ms (${count} chord(s) coalesced)`)
    }
  }

  /**
   * Wrap the buffer at MAX_COLS (hard character wrap — the firmware font is
   * fixed and this is a demo, not a typesetter) and keep the last MAX_ROWS
   * lines so the newest text is always on the glass.
   */
  private trailingWindow(): string {
    const lines: string[] = []
    for (const paragraph of this.buffer.split("\n")) {
      if (paragraph.length === 0) {
        lines.push("")
        continue
      }
      for (let i = 0; i < paragraph.length; i += MAX_COLS) {
        lines.push(paragraph.slice(i, i + MAX_COLS))
      }
    }
    return lines.slice(-MAX_ROWS).join("\n")
  }

  private render(text: string): void {
    // One full-canvas text element with a stable id: successive renders update
    // it in place on the glasses (no flicker). Same pattern as the captions
    // miniapp. render() never rejects; it resolves {status: "blocked"} instead.
    const d = this.session.capabilities?.display
    void this.session.display.render([
      {type: "text", id: "tap-buffer", box: {x: 0, y: 0, w: d?.width ?? 576, h: d?.height ?? 288}, text},
    ])
  }
}

registerMiniapp((session) => {
  new TapTypingController(session).start()
})
