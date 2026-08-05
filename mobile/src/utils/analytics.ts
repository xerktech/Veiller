// Firebase Analytics was removed (XERK-200): the SDK shipped Firebase Core +
// GoogleAppMeasurement in every build while nothing in the app ever logged an
// event — PostHog and Sentry are the live telemetry paths. The exported API is
// kept as no-ops so call sites (and future ones) stay source-compatible; if
// product analytics are wanted here again, route them to PostHog instead.

export async function initAnalytics() {}

export async function logEvent(_name: string, _params?: Record<string, string | number | boolean>) {}

export async function setUserId(_id: string | null) {}

export async function setUserProperty(_name: string, _value: string | null) {}

export async function logScreenView(_screenName: string, _screenClass?: string) {}
