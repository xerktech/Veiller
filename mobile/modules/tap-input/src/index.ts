/**
 * @foverlay/tap-input — JS surface for the TapInput native module.
 *
 * Android-only: the native module exists only in the Android build, so
 * everything here degrades to a no-op elsewhere (iOS, tests, web) via
 * requireOptionalNativeModule.
 */
import {requireOptionalNativeModule} from "expo"

export interface TapInputEvent {
  /** Printable character (" " = space, "\n" = enter), or null for non-text actions. */
  char: string | null
  action: "char" | "backspace" | "shift" | "switch" | "unmapped"
  /** Raw 5-bit finger bitmask, 1–31. LSB = thumb, MSB = pinky. */
  tapcode: number
  /** 1 = single tap, 2 = double, 3 = triple. */
  repeat: number
  /** Wall-clock ms at the native SDK callback — latency measurement anchor. */
  timestamp: number
  source: "real" | "fake"
}

export interface TapStatusEvent {
  status: "connecting" | "connected" | "disconnected" | "error" | "bluetooth_off"
  tapIdentifier: string | null
}

interface TapInputNativeModule {
  addListener(eventName: "tap_input", listener: (event: TapInputEvent) => void): {remove(): void}
  addListener(eventName: "tap_status", listener: (event: TapStatusEvent) => void): {remove(): void}
  start(): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean
}

const NativeTapInput = requireOptionalNativeModule<TapInputNativeModule>("TapInput")

/** True when the native module is present (Android builds that include it). */
export const isTapInputAvailable = NativeTapInput != null

/**
 * Subscribe to decoded tap chords. Returns null when the native module is
 * unavailable — callers should treat that as "no tap hardware on this platform".
 */
export function addTapInputListener(listener: (event: TapInputEvent) => void): {remove(): void} | null {
  return NativeTapInput?.addListener("tap_input", listener) ?? null
}

/** Subscribe to Tap Strap connection status changes. */
export function addTapStatusListener(listener: (event: TapStatusEvent) => void): {remove(): void} | null {
  return NativeTapInput?.addListener("tap_status", listener) ?? null
}

/**
 * Start the TapInputService foreground service (idempotent). Must be called
 * while the app is foregrounded (Android FGS start restriction).
 */
export async function startTapInput(): Promise<void> {
  await NativeTapInput?.start()
}

/** Stop the TapInputService. */
export async function stopTapInput(): Promise<void> {
  await NativeTapInput?.stop()
}
