import * as Sentry from "@sentry/react-native"

import {SETTINGS, engine} from "@veiller/engine"

export const SentryNavigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  routeChangeTimeoutMs: 1_000, // default: 1_000
  ignoreEmptyBackNavigationTransactions: true, // default: true
})

/**
 * Demote known third-party fatal errors to non-fatal Sentry reports so the
 * app doesn't get torn down by them. Currently filters:
 *   - PostHog session-id uuidv7 generation throwing `RangeError: invalid field value`
 *     (VEILLER-OS-1SE). Affects devices with clock skew; can't be fixed from app code
 *     without upgrading @posthog/core.
 */
const installKnownErrorFilter = () => {
  const ErrorUtils = (global as any).ErrorUtils
  if (!ErrorUtils || typeof ErrorUtils.getGlobalHandler !== "function") return
  const previous = ErrorUtils.getGlobalHandler()
  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      const msg = error?.message ?? String(error)
      const stack = error?.stack ?? ""
      const isPosthogUuidV7 =
        msg === "invalid field value" &&
        (stack.includes("fromFieldsV7") || stack.includes("uuidv7") || stack.includes("getSessionId"))
      if (isPosthogUuidV7) {
        Sentry.captureException(error, {
          tags: {filtered: "posthog_uuidv7_rangeerror"},
          level: "warning",
        })
        return
      }
    } catch {
      // fall through to default handler on any meta-error
    }
    previous?.(error, isFatal)
  })
}

/**
 * Did Sentry.init() actually run? False whenever there is no DSN (the default
 * in .env.example) or on the China build.
 *
 * `_layout.tsx` must not apply `Sentry.wrap` when this is false: wrapping an
 * uninitialized Sentry logs "App Start Span could not be finished. `Sentry.wrap`
 * was called before `Sentry.init`" on every navigation — 16 times in a single
 * QA session — and drops the app-start spans it was meant to record.
 */
export let sentryInitialized = false

export const SentrySetup = () => {
  // Always install — the filter prevents a known-fatal PostHog bug from killing
  // the app even when Sentry itself isn't initialized.
  installKnownErrorFilter()
  // Only initialize Sentry if DSN is provided
  const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  const isChina = engine.settings.get(SETTINGS.china_deployment.key)

  if (!sentryDsn || sentryDsn === "secret" || sentryDsn.trim() === "") {
    return
  }
  if (isChina) {
    return
  }

  const release = `${process.env.EXPO_PUBLIC_VEILLER_VERSION}`
  const dist = `${process.env.EXPO_PUBLIC_BUILD_TIME}-${process.env.EXPO_PUBLIC_BUILD_COMMIT}`
  const branch = process.env.EXPO_PUBLIC_BUILD_BRANCH
  const isProd = branch == "main" || branch == "staging"
  // const sampleRate = isProd ? 0.1 : 1.0
  const sampleRate = 1.0

  sentryInitialized = true
  Sentry.init({
    dsn: sentryDsn,

    // Adds more context data to events (IP address, cookies, user, etc.)
    // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
    sendDefaultPii: true,

    // send 1/10th of events in prod:
    tracesSampleRate: sampleRate,

    // debug: true,
    _experiments: {
      enableUnhandledCPPExceptionsV2: true,
    },
    //   enableNativeCrashHandling: false,
    //   enableNativeNagger: false,
    //   enableNative: false,
    //   enableLogs: false,
    //   enabled: false,
    release: release,
    dist: dist,
    integrations: [Sentry.feedbackIntegration({})],

    // Reduce breadcrumb count to prevent memory issues during high-frequency BLE logging
    maxBreadcrumbs: 100,

    // Truncate noisy BLE breadcrumbs to prevent Sentry crashes (see VEILLER-OS-13Z, 13K, 13N, 13P)
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === "console" && breadcrumb.message) {
        const msg = breadcrumb.message
        // Truncate high-frequency BLE reconnection logs
        if (msg.includes("G1:")) {
          breadcrumb.message = `[G1 BLE] ${msg.substring(0, 50)}...`
        } else if (msg.includes("peripheral")) {
          breadcrumb.message = `[BLE peripheral] ${msg.substring(0, 50)}...`
        }
      }
      // Ignore touch breadcrumbs
      if (breadcrumb.category === "touch") {
        return null
      }
      return breadcrumb
    },
  })
}
