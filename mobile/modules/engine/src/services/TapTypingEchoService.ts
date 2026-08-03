/**
 * Foverlay: Tap Strap 2 → glasses text echo, as a HOST feature (no miniapp).
 *
 * Owns the @foverlay/tap-input subscription (starts the Android foreground
 * service that holds the Tap BLE link) and renders a typing buffer to the
 * glasses' main view. Foverlay is a dedicated app — this is a first-class
 * engine service, not a plugin.
 *
 * Rendering goes through LocalDisplayManager.request() with a reserved
 * system packageName (matching the "system.boot"/"system.clear" convention)
 * so boot-window queueing, the single native scene slot, and reconnect
 * replay all stay coherent. No durationMs — the buffer persists until
 * cleared. The native G2 driver owns BLE pacing/coalescing; the 90 ms timer
 * here only avoids one JS→native render call per keystroke at fast typing
 * speeds. Trailing-window clipping is done here because the shared
 * TextWrapper clips from the top (oldest lines win — wrong direction for a
 * typing echo).
 *
 * Start/stop shape mirrors DeviceEventRouter (module-level state, idempotent).
 */
import {addTapInputListener, startTapInput, type TapInputEvent} from "@foverlay/tap-input"

import localDisplayManager from "./LocalDisplayManager"
import sceneRenderer from "./SceneRenderer"
import {isGlassesReady} from "./GlassesReadiness"
import {useGlassesStore} from "../stores/glasses"

const ECHO_PKG = "system.tap-echo"
const RENDER_INTERVAL_MS = 90
/** Hard character wrap; the G2 firmware font fits ~30 glyphs on the 576px canvas. */
const MAX_COLS = 30
/** Trailing lines kept on screen (full canvas fits ~7 at the calibrated 40px line height). */
const MAX_ROWS = 5
const CURSOR = "_"
const READY_TEXT = "Tap Typing Demo ready"

let subs: Array<{remove: () => void}> = []
let buffer = ""
let lastRendered = ""
let renderTimer: ReturnType<typeof setTimeout> | null = null
let pendingSince: number | null = null
let pendingCount = 0

export function startTapTypingEcho(): void {
  if (subs.length) return

  const tapSub = addTapInputListener(onTap)
  if (!tapSub) return // native module absent (iOS, tests) — feature off
  subs.push(tapSub)

  // Boot the Android foreground service that owns the Tap BLE connection.
  // engine.start() runs foregrounded, satisfying the FGS start restriction.
  void startTapInput().catch(() => {})

  // Paint the ready banner when the glasses come up (and repaint the buffer
  // after reconnects — LocalDisplayManager replays, but a fresh render after
  // readiness flips keeps the echo authoritative).
  let wasReady = false
  subs.push({
    remove: useGlassesStore.subscribe((s) => {
      const ready = isGlassesReady(s.connection)
      if (ready && !wasReady) scheduleRender()
      wasReady = ready
    }),
  })

  if (isGlassesReady(useGlassesStore.getState().connection)) scheduleRender()
  console.log("TapTypingEcho: started")
}

export function stopTapTypingEcho(): void {
  for (const sub of subs) sub.remove()
  subs = []
  if (renderTimer !== null) {
    clearTimeout(renderTimer)
    renderTimer = null
  }
  buffer = ""
  lastRendered = ""
  pendingSince = null
  pendingCount = 0
  // Forfeit the view (empty scene = clear) so nothing stale lingers.
  localDisplayManager.request(ECHO_PKG, {view: "main", scene: []})
}

function onTap(event: TapInputEvent): void {
  switch (event.action) {
    case "char":
      buffer += event.char ?? ""
      break
    case "backspace":
      buffer = buffer.slice(0, -1)
      break
    case "shift":
    case "switch":
      console.log(`TapTypingEcho: ${event.action} chord ignored (layers stubbed)`)
      return
    case "unmapped":
      console.log(`TapTypingEcho: unmapped tapcode=${event.tapcode} repeat=${event.repeat}`)
      return
  }

  if (pendingSince === null) pendingSince = event.timestamp
  pendingCount++
  scheduleRender()
}

function scheduleRender(): void {
  if (renderTimer !== null) return
  renderTimer = setTimeout(() => {
    renderTimer = null
    flush()
  }, RENDER_INTERVAL_MS)
}

function flush(): void {
  const body = buffer.length > 0 ? trailingWindow() : READY_TEXT + "\n"
  const text = body + CURSOR
  const oldest = pendingSince
  const count = pendingCount
  pendingSince = null
  pendingCount = 0

  // Skip the display call entirely when nothing visible changed (backspace
  // on an empty buffer, unmapped chords only).
  if (text === lastRendered) return
  lastRendered = text

  const caps = sceneRenderer.currentCapabilities()
  localDisplayManager.request(ECHO_PKG, {
    view: "main",
    scene: [
      {
        type: "text",
        id: "echo:buffer",
        box: {x: 0, y: 0, w: caps?.width ?? 576, h: caps?.height ?? 288},
        text,
      },
    ],
    // no durationMs — persist until explicitly cleared
  })

  // Latency instrumentation: native tap-SDK callback timestamp → this display
  // call. The BLE leg to the glass (native EvenHub queue) adds on top.
  if (oldest !== null) {
    console.log(`TapTypingEcho: latency keystroke->display-call ${Date.now() - oldest}ms (${count} chord(s) coalesced)`)
  }
}

/**
 * Wrap the buffer at MAX_COLS (hard character wrap — fixed firmware font,
 * demo not typesetter) and keep the last MAX_ROWS lines so the newest text
 * is always on the glass.
 */
function trailingWindow(): string {
  const lines: string[] = []
  for (const paragraph of buffer.split("\n")) {
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
