import {create} from "zustand"
import {subscribeWithSelector} from "zustand/middleware"
import type {TapStrapStatus} from "@veiller/bluetooth-sdk/internal"

/**
 * Tap Strap status store — mirror of the native TapStrapManager snapshot
 * (`tap_strap_status` events + getTapStrapStatus hydration). Owned by the
 * TapStrapCoordinator; UIs read it through the engine.tapStrap facade.
 */
export interface TapStrapState extends TapStrapStatus {
  setStatus: (status: TapStrapStatus) => void
  reset: () => void
}

const initialState: TapStrapStatus = {
  supported: false,
  takeoverEnabled: false,
  bluetoothPermission: true,
  taps: [],
}

export const useTapStrapStore = create<TapStrapState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setStatus: (status) => set((state) => ({...state, ...status})),

    reset: () => set(initialState),
  })),
)
