/**
 * What to do with an incoming deep link, decided without side effects.
 *
 * This logic caused four consecutive QA failures, each time because a fix was
 * locally correct and globally wrong: a guard that read state its own caller
 * had just written, dedup state on a `let` that every render reset, a screen
 * that cleared history before knowing whether anything would replace it. None
 * of it was covered by a test — a mutation audit re-introduced every one of
 * those bugs with the whole suite still green.
 *
 * So the decision lives here, as a function of explicit inputs, and the React
 * code does nothing but carry it out.
 */

export type DeeplinkPlan =
  /** Not a real link (an Expo dev-client URL). Ignore entirely. */
  | {kind: "ignore"; reason: string}
  /**
   * The app has not booted. Remember the URL and go through the index route,
   * which runs mantle.init() — without it, home renders with no built-in
   * miniapps (no Settings tile, no Glasses Mirror, no bottom bar).
   */
  | {kind: "defer-for-boot"}
  /** A boot is already in flight for this exact URL; do nothing. */
  | {kind: "already-deferred"}
  /** Delivered again within the dedup window; an earlier delivery handled it. */
  | {kind: "duplicate"}
  /** Dispatch to the matching route handler. */
  | {kind: "dispatch"}

export interface DeeplinkPlanInput {
  url: string
  /** Has mantle.init() completed? */
  isInitialized: boolean
  /** The deeplinkKey() a boot is already deferred for, if any. */
  bootDeferredFor: string | null
  /** The last URL actually dispatched, and when. */
  lastDispatched: {url: string | null; at: number}
  now: number
  /**
   * True for the cold-start `getInitialURL` delivery. Those bypass the dedup
   * window: they are the first delivery by definition, and the replay after
   * boot must not be mistaken for a repeat.
   */
  initial: boolean
}

/** How long after a dispatch the same URL is treated as a repeat delivery. */
export const DEDUP_WINDOW_MS = 3000

/**
 * The identity of a deep link, independent of how it was spelled.
 *
 * One tap can arrive as two different strings: `+not-found` reconstructs the
 * path with the app scheme, while `Linking.getInitialURL()` reports the
 * original — so an App Link shows up as both
 * `https://apps.mentraglass.com/package/x` and
 * `com.xerktech.veiller://package/x`. Comparing raw strings therefore missed
 * that they are the same link, deferred the boot twice, and mounted the index
 * route twice; that is exactly the race that made a second index instance wipe
 * the first one's replay. Compare on path + query instead.
 */
export function deeplinkKey(url: string): string {
  try {
    const parsed = new URL(url)
    const isWeb = parsed.protocol === "http:" || parsed.protocol === "https:"
    // For the custom scheme the first path segment parses as the *host*
    // (`app://settings` → host "settings"), so fold it back in — the same
    // reasoning as effectivePathname() in DeeplinkContext.
    const path = isWeb ? parsed.pathname : `/${parsed.host}${parsed.pathname}`
    const normalised = path.replace(/\/+$/, "") || "/"
    return `${normalised}${parsed.search}`
  } catch {
    return url
  }
}


export function planDeeplink(input: DeeplinkPlanInput): DeeplinkPlan {
  const {url, isInitialized, bootDeferredFor, lastDispatched, now, initial} = input

  // Expo's dev-client links restart the app on Android after a hot reload.
  if (url.includes("expo-development-client")) {
    return {kind: "ignore", reason: "expo-development-client URL"}
  }

  if (!isInitialized) {
    // Deliberately compared against our OWN record. Reading the shared
    // navigation pendingRoute made this see a write from the same call a few
    // lines earlier, so it skipped the boot and paths with a real file route —
    // which have no second entry point — never started the app at all.
    return bootDeferredFor === deeplinkKey(url)
      ? {kind: "already-deferred"}
      : {kind: "defer-for-boot"}
  }

  if (
    !initial &&
    lastDispatched.url !== null &&
    deeplinkKey(url) === deeplinkKey(lastDispatched.url) &&
    now - lastDispatched.at < DEDUP_WINDOW_MS
  ) {
    return {kind: "duplicate"}
  }

  return {kind: "dispatch"}
}

/**
 * Should a translation shim (the `+not-found` screen) reset to home before
 * handing a URL off?
 *
 * Only when something is definitely going to navigate afterwards. Clearing
 * unconditionally stranded the user on home whenever the handoff then declined
 * to navigate — a duplicate delivery, for instance — and clearing *before boot*
 * produced exactly the crippled home the deferral exists to avoid.
 */
export function shouldResetToHomeBeforeHandoff(plan: DeeplinkPlan): boolean {
  return plan.kind === "dispatch"
}


/**
 * What the `+not-found` shim should do, given the plan for its URL.
 *
 * Extracted because a mutation audit showed these branches were invisible to
 * every gate: removing the `duplicate` case (the branch every warm deep link
 * takes) or the rescue timer's boot check left the whole suite green.
 */
export type NotFoundAction =
  /** Pop this shim to reveal what an earlier delivery already pushed. */
  | {kind: "pop"}
  /** Drop the shim to home first, then hand off — the push lands on home. */
  | {kind: "reset-then-handoff"}
  /** Hand off without touching history; nothing is going to navigate yet. */
  | {kind: "handoff"}

export function decideNotFoundAction(plan: DeeplinkPlan): NotFoundAction {
  // An earlier delivery of this URL already navigated, and what the user asked
  // for is on the stack underneath. Resetting to home here threw that away.
  if (plan.kind === "duplicate") return {kind: "pop"}

  // Only reset when something will definitely replace this screen. Doing it
  // unconditionally stranded the user on home whenever the handoff declined to
  // navigate, and doing it before boot produced the crippled home.
  if (shouldResetToHomeBeforeHandoff(plan)) return {kind: "reset-then-handoff"}

  return {kind: "handoff"}
}

/**
 * May the shim's rescue timer navigate home?
 *
 * Only once the app has booted. Firing before mantle.init() produces a home
 * screen with no Settings tile, no Glasses Mirror and no bottom bar — exactly
 * the state the boot deferral exists to prevent.
 */
export function mayRescueToHome(opts: {isMounted: boolean; isInitialized: boolean}): boolean {
  return opts.isMounted && opts.isInitialized
}
