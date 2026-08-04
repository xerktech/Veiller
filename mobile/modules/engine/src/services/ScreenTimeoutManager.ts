/**
 * Screen-timeout state machine — the pure idle-timer logic behind XERK-201's
 * glasses display auto-off, split from ScreenTimeoutCoordinator so it can be
 * unit-tested with an injected clock and no store / BLE / react-native imports.
 *
 * There is no G1 firmware opcode for a display timeout, so it is enforced
 * phone-side: every display update the phone sends to the glasses is fed in via
 * `noteDisplayEvent`, and each contentful update (re)arms an idle timer. When the
 * timer fires — nothing new shown for `screen_timeout` seconds — `blankDisplay`
 * runs. A timeout of 0 means "never" (today's behavior: content persists).
 */
import {BgTimer} from "../utils/timers"

const LOG_TAG = "SCREEN_TIMEOUT"

/** Minimal timer surface so tests can drive an injected clock. */
export interface TimerApi {
  setTimeout: (callback: () => void, delayMs: number) => number
  clearTimeout: (timeoutId: number) => void
}

const DEFAULT_TIMERS: TimerApi = {
  setTimeout: (callback, delayMs) => BgTimer.setTimeout(callback, delayMs),
  clearTimeout: (timeoutId) => BgTimer.clearTimeout(timeoutId),
}

/**
 * True when a display event puts something visible on the glasses (so it should
 * arm the idle timer), false for a clear / empty frame (screen is already off).
 * Unknown layout types are treated as content: arming a timer that later blanks
 * an already-blank screen is harmless, whereas failing to arm would defeat the
 * feature.
 */
export function eventHasContent(event: unknown): boolean {
  if (!event || typeof event !== "object") return false
  const layout = (event as {layout?: unknown}).layout
  if (!layout || typeof layout !== "object") return false

  const layoutType = (layout as {layoutType?: unknown}).layoutType
  switch (layoutType) {
    case "clear_view":
      return false
    case "scene": {
      const elements = (layout as {elements?: unknown}).elements
      return Array.isArray(elements) && elements.length > 0
    }
    case "text_wall":
    case "text_line": {
      const text = (layout as {text?: unknown}).text
      return typeof text === "string" && text.trim() !== ""
    }
    case "double_text_wall": {
      const {topText, bottomText} = layout as {topText?: unknown; bottomText?: unknown}
      return (
        (typeof topText === "string" && topText.trim() !== "") ||
        (typeof bottomText === "string" && bottomText.trim() !== "")
      )
    }
    case "text_rows": {
      const rows = (layout as {text?: unknown}).text
      return Array.isArray(rows) && rows.some((row) => typeof row === "string" && row.trim() !== "")
    }
    case "bitmap_view": {
      const data = (layout as {data?: unknown}).data
      return typeof data === "string" && data.length > 0
    }
    default:
      // reference_card, positioned_text, dashboard_card, and any future layout:
      // if there's a layout and it isn't an explicit clear, assume it's content.
      return true
  }
}

export class ScreenTimeoutManager {
  private timeoutSeconds = 0
  private screenHasContent = false
  private timerId: number | null = null

  /**
   * @param blankDisplay invoked when the idle timer expires (turn the screen off).
   * @param timers       injectable timer surface (defaults to the background-safe BgTimer).
   */
  constructor(
    private readonly blankDisplay: () => void,
    private readonly timers: TimerApi = DEFAULT_TIMERS,
  ) {}

  /** Update the configured timeout (seconds; <= 0 disables auto-off). */
  setTimeoutSeconds(seconds: number): void {
    this.timeoutSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
    this.reevaluate()
  }

  /** Feed the latest display event; contentful events (re)start the idle timer. */
  noteDisplayEvent(event: unknown): void {
    this.screenHasContent = eventHasContent(event)
    this.reevaluate()
  }

  /** Cancel any pending timer (coordinator teardown). */
  dispose(): void {
    this.cancel()
  }

  private reevaluate(): void {
    if (this.timeoutSeconds > 0 && this.screenHasContent) {
      this.arm()
    } else {
      this.cancel()
    }
  }

  private arm(): void {
    this.cancel()
    this.timerId = this.timers.setTimeout(() => {
      this.timerId = null
      // The screen is about to go blank; a later contentful event re-arms.
      this.screenHasContent = false
      try {
        this.blankDisplay()
      } catch (error) {
        console.warn(`${LOG_TAG}: blankDisplay failed:`, error)
      }
    }, this.timeoutSeconds * 1000)
  }

  private cancel(): void {
    if (this.timerId !== null) {
      this.timers.clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  /** Test-only: whether an idle timer is currently pending. */
  _isArmed(): boolean {
    return this.timerId !== null
  }
}
