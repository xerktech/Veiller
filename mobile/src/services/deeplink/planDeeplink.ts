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
  /** The URL a boot is already deferred for, if any. */
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
    return bootDeferredFor === url ? {kind: "already-deferred"} : {kind: "defer-for-boot"}
  }

  if (!initial && url === lastDispatched.url && now - lastDispatched.at < DEDUP_WINDOW_MS) {
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
