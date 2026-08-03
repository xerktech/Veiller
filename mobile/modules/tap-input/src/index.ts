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
  /** "real" = strap hardware; "fake" = adb broadcast; "test" = UI test button. */
  source: "real" | "fake" | "test"
}

export interface TapStatusEvent {
  status: "connecting" | "connected" | "disconnected" | "mode_changed" | "error" | "bluetooth_off"
  tapIdentifier: string | null
  /** Strap input mode name (e.g. "controller", "text (HID keyboard)") on mode_changed. */
  mode: string | null
}

export interface TapStatusSnapshot {
  serviceRunning: boolean
  /** "stopped" | "running" | "no_permission" | "failed" — the SDK source's state. */
  realSource: string
  /** OS-bonded Tap devices by name, connected or not — "" pairing visibility. */
  bondedTaps: string[]
  /** Currently connected straps and their last known mode. */
  taps: Array<{tapIdentifier: string; mode: string}>
  /** Total chords received since service start (all sources). */
  tapCount: number
  /** The last decoded chord payload (same shape as TapInputEvent), if any. */
  lastChord: TapInputEvent | null
  lastStatus: string | null
}

interface TapInputNativeModule {
  addListener(eventName: "tap_input", listener: (event: TapInputEvent) => void): {remove(): void}
  addListener(eventName: "tap_status", listener: (event: TapStatusEvent) => void): {remove(): void}
  start(): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean
  getStatus(): TapStatusSnapshot
  injectTap(char: string): Promise<void>
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

/** Subscribe to Tap Strap connection/mode status changes. */
export function addTapStatusListener(listener: (event: TapStatusEvent) => void): {remove(): void} | null {
  return NativeTapInput?.addListener("tap_status", listener) ?? null
}

/** Point-in-time status snapshot (strap list + modes + counters), or null off-Android. */
export function getTapStatus(): TapStatusSnapshot | null {
  return NativeTapInput?.getStatus() ?? null
}

/**
 * Inject one character through the same pipeline real chords use — the UI
 * "send test tap" button. Verifies the phone→glasses leg without hardware.
 */
export async function injectTestTap(char: string): Promise<void> {
  await NativeTapInput?.injectTap(char)
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
