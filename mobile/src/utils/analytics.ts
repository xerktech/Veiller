/**
 * Analytics — no-op in Foverlay.
 *
 * Firebase (@react-native-firebase/analytics) was removed with the dependency
 * strip: a private, unpublished app doesn't ship Google Analytics. The exported
 * surface is preserved as no-ops so existing call sites keep compiling and
 * running; wire a real provider here later if Foverlay ever wants telemetry.
 */

export async function initAnalytics(): Promise<void> {}

export async function logEvent(_name: string, _params?: Record<string, string | number | boolean>): Promise<void> {}

export async function setUserId(_id: string | null): Promise<void> {}

export async function setUserProperty(_name: string, _value: string | null): Promise<void> {}

export async function logScreenView(_screenName: string, _screenClass?: string): Promise<void> {}
