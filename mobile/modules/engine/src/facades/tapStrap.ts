/**
 * tapStrap facade — `engine.tapStrap.*`: status read-model for paired Tap Strap 2
 * devices plus the takeover toggle (MentraOS holding straps in controller mode so
 * they stop acting as phone keyboards). Pairing itself happens in the phone's
 * Bluetooth settings; glasses control from tap input is a follow-up.
 */
import BluetoothSdk from "@mentra/bluetooth-sdk/internal"

import {useTapStrapStore} from "../stores/tapStrap"
import {useSettingsStore, SETTINGS} from "../stores/settings"

function projectStatus() {
  const s = useTapStrapStore.getState()
  return {
    supported: s.supported,
    takeoverEnabled: s.takeoverEnabled,
    bluetoothPermission: s.bluetoothPermission,
    // Copy: the snapshot must not hand callers a mutable reference into the store.
    taps: s.taps.map((tap) => ({...tap})),
    paired: s.taps.length > 0,
    connectedCount: s.taps.filter((tap) => tap.connected).length,
  }
}

export type TapStrapStatusSnapshot = ReturnType<typeof projectStatus>

export const tapStrap = {
  status: (): TapStrapStatusSnapshot => projectStatus(),
  onStatus: (cb: (status: TapStrapStatusSnapshot) => void): (() => void) => {
    let last = JSON.stringify(projectStatus())
    return useTapStrapStore.subscribe(() => {
      const snap = projectStatus()
      const key = JSON.stringify(snap)
      if (key === last) return
      last = key
      cb(snap)
    })
  },
  /**
   * Toggle takeover. Persists the setting; the TapStrapCoordinator's settings
   * subscription pushes it to native (and re-seeds it on every engine start).
   */
  setTakeover: async (enabled: boolean): Promise<void> => {
    const result = await useSettingsStore.getState().setSetting(SETTINGS.tap_strap_takeover.key, enabled)
    if (result.is_error()) throw result.error
  },
  /** Re-pull the native snapshot into the store (e.g. after a permission grant). */
  refresh: async (): Promise<void> => {
    const status = await BluetoothSdk.getTapStrapStatus()
    useTapStrapStore.getState().setStatus(status)
  },
}
