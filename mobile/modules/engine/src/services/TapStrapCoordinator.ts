/**
 * Tap Strap coordinator — engine-owned glue between the native TapStrapManager
 * and the JS runtime:
 *
 *  - routes native `tap_strap_status` events into the tapStrap store,
 *  - hydrates the store once at start (pull — events only cover changes),
 *  - seeds the native takeover state from the persisted `tap_strap_takeover`
 *    setting at start and re-applies it on every setting change (the setting is
 *    the source of truth; native holds no persistence and starts disengaged).
 *
 * Started by `engine.start()`. Idempotent.
 */
import BluetoothSdk from "@veiller/bluetooth-sdk/internal"

import {useTapStrapStore} from "../stores/tapStrap"
import {useSettingsStore, SETTINGS} from "../stores/settings"

let subs: Array<{remove: () => void}> = []

export function startTapStrapCoordinator(): void {
  if (subs.length) return

  // Native status stream → store.
  subs.push(
    BluetoothSdk.addListener("tap_strap_status", (event) => {
      const {type: _type, ...status} = event
      useTapStrapStore.getState().setStatus(status)
    }),
  )

  // Persisted toggle → native. subscribeWithSelector fires on changes only, so
  // the initial seed below still covers the cold-start value.
  subs.push({
    remove: useSettingsStore.subscribe(
      (s) => s.getSetting(SETTINGS.tap_strap_takeover.key) as boolean,
      (takeover) => {
        BluetoothSdk.setTapStrapTakeover(!!takeover).catch((error) => {
          console.warn("TapStrapCoordinator: setTapStrapTakeover failed:", error)
        })
      },
    ),
  })

  // Seed native from the persisted setting, then hydrate the store with the
  // resulting snapshot. Native starts with takeover disengaged every launch, so
  // only an enabled setting needs pushing.
  const seed = async () => {
    const takeover = !!useSettingsStore.getState().getSetting(SETTINGS.tap_strap_takeover.key)
    if (takeover) {
      await BluetoothSdk.setTapStrapTakeover(true)
    }
    const status = await BluetoothSdk.getTapStrapStatus()
    useTapStrapStore.getState().setStatus(status)
  }
  seed().catch((error) => {
    console.warn("TapStrapCoordinator: initial seed failed:", error)
  })
}

export function stopTapStrapCoordinator(): void {
  for (const sub of subs) sub.remove()
  subs = []
}
