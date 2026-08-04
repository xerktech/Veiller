/**
 * Screen-timeout coordinator — phone-side "turn the glasses display off after N
 * seconds of inactivity", mirroring the auto-off / screen-timeout setting in the
 * native Even Realities app (XERK-201).
 *
 * The idle-timer logic lives in ScreenTimeoutManager; this module is the wiring:
 * every display update the phone sends to the glasses lands in `useDisplayStore`,
 * so we feed `currentEvent` changes to the manager as activity and feed the
 * `screen_timeout` setting as the timeout. `screen_timeout == 0` means "never"
 * and keeps today's behavior (content persists until replaced or cleared).
 *
 * Started by `engine.start()`. Idempotent.
 */
import BluetoothSdk from "@mentra/bluetooth-sdk/internal"

import sceneRenderer from "./SceneRenderer"
import {ScreenTimeoutManager} from "./ScreenTimeoutManager"
import {useDisplayStore} from "../stores/display"
import {SETTINGS, useSettingsStore} from "../stores/settings"

const LOG_TAG = "SCREEN_TIMEOUT"

/** Blank the glasses display and let positioning devices repaint on next render. */
function blankGlassesDisplay(): void {
  // Scene devices diff against a retained baseline; after an out-of-band clear
  // that baseline no longer matches the (now blank) glasses, so mark it stale so
  // the next render repaints from empty instead of skipping "unchanged" elements.
  // The G1/legacy path re-sends every frame, so this is just a safety net there.
  try {
    sceneRenderer.markViewStale("main")
  } catch (error) {
    console.warn(`${LOG_TAG}: markViewStale failed:`, error)
  }
  void Promise.resolve(BluetoothSdk.clearDisplay()).catch((error) => {
    console.warn(`${LOG_TAG}: clearDisplay failed:`, error)
  })
}

let manager: ScreenTimeoutManager | null = null
let subs: Array<{remove: () => void}> = []

function readTimeoutSeconds(): number {
  return Number(useSettingsStore.getState().getSetting(SETTINGS.screen_timeout.key)) || 0
}

export function startScreenTimeoutCoordinator(): void {
  if (manager) return
  const mgr = new ScreenTimeoutManager(blankGlassesDisplay)
  manager = mgr

  // Seed from the persisted setting + whatever is currently on screen, then keep
  // both in sync. subscribeWithSelector fires on changes only, so the seeds below
  // cover the cold-start values.
  mgr.setTimeoutSeconds(readTimeoutSeconds())
  mgr.noteDisplayEvent(useDisplayStore.getState().currentEvent)

  subs.push({
    remove: useSettingsStore.subscribe(
      (s) => Number(s.getSetting(SETTINGS.screen_timeout.key)) || 0,
      (seconds) => mgr.setTimeoutSeconds(seconds),
    ),
  })
  subs.push({
    remove: useDisplayStore.subscribe(
      (s) => s.currentEvent,
      (event) => mgr.noteDisplayEvent(event),
    ),
  })
}

export function stopScreenTimeoutCoordinator(): void {
  for (const sub of subs) sub.remove()
  subs = []
  manager?.dispose()
  manager = null
}
