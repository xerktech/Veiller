/**
 * @fileoverview Shape of window.Veiller, injected by the host Veiller app
 * before the miniapp's content loads. Miniapp authors generally won't read
 * this directly — use the typed React hooks (useSafeArea, etc.) instead.
 */

export interface MiniappSafeAreaInsets {
  top: number
  bottom: number
  left: number
  right: number
}

export interface MiniappCapsuleMenuRect {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

export type MiniappColorScheme = "light" | "dark"

export interface VeillerGlobals {
  /** Package id the host assigned to this miniapp (e.g. "com.veiller.example"). */
  packageName?: string
  /** "ios" | "android" | other. */
  platform?: string
  /** Capabilities the host exposes to this miniapp (e.g. ["share", "open_url"]). */
  capabilities?: string[]
  /** True when this miniapp is running locally on-device (vs. hosted in the cloud). */
  miniappLocal?: boolean
  /** True when the miniapp is running via the dev workflow (QR sideload). */
  miniappDeveloperMode?: boolean
  /** Safe-area insets around the WebView content. Miniapps should pad accordingly. */
  safeAreaInsets?: MiniappSafeAreaInsets
  /**
   * Bounding rect (in CSS pixels) of the floating capsule menu the host draws
   * over the WebView. The menu lives in the top-right and miniapps should
   * avoid placing interactive elements beneath it.
   */
  capsuleMenu?: MiniappCapsuleMenuRect
  /**
   * The host's current color scheme. Miniapps can follow this to match the
   * phone's appearance. Updates at runtime arrive via the session's
   * `colorScheme` event — see `useColorScheme()` in @veiller/miniapp/react.
   */
  colorScheme?: MiniappColorScheme
}

declare global {
  interface Window {
    Veiller?: VeillerGlobals
  }
}

/** Reads window.Veiller safely — returns an empty object if not set. */
export function getVeillerGlobals(): VeillerGlobals {
  if (typeof window === "undefined") return {}
  return window.Veiller ?? {}
}
