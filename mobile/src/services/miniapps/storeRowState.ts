/**
 * What one miniapp-store row should say and offer.
 *
 * Pulled out of store.tsx as a pure function because the interaction between
 * "is an update available" and "should the action button render" is exactly
 * where a regression slipped through: tightening `updateAvailable` to require
 * an installed app also silenced the button, leaving the store with no way to
 * install anything (XERK-249). The two are separate questions and are now
 * derived — and tested — separately.
 */

export type RowAvailability = "loading" | "resolved" | "error"

export interface StoreRowInput {
  /** How the "latest published version" lookup went. */
  availability: RowAvailability
  /** Newest version published for this miniapp, when known. */
  availableVersion: string | null
  /** Version currently installed on the phone, or null if absent. */
  installedVersion: string | null
  /** Is an install/update in flight right now? */
  busy: boolean
  /** Did the last install attempt fail? */
  failed: boolean
  /** Is this miniapp opted in to installs/updates? */
  enabled: boolean
}

/** Which status line the row shows. Maps 1:1 to an i18n key in store.tsx. */
export type StoreRowStatus =
  | "stage"
  | "checking"
  | "updateAvailable"
  | "checkFailed"
  | "upToDate"
  | "notInstalled"

export interface StoreRowState {
  status: StoreRowStatus
  /** Render the primary action button? */
  showAction: boolean
  /** What that button does — only meaningful when showAction is true. */
  action: "install" | "update" | "retry" | null
  /** Emphasise the status line (an update or an in-flight install). */
  emphasise: boolean
}

export function deriveStoreRowState(input: StoreRowInput): StoreRowState {
  const {availability, availableVersion, installedVersion, busy, failed, enabled} = input
  const isInstalled = !!installedVersion
  const resolved = availability === "resolved" && availableVersion != null

  // An update is only "available" for something you actually have.
  const updateAvailable = resolved && isInstalled && availableVersion !== installedVersion
  // The button, however, must also appear when nothing is installed yet.
  const canInstall = resolved && !isInstalled
  const canAct = updateAvailable || canInstall

  let status: StoreRowStatus
  if (busy) {
    status = "stage"
  } else if (availability === "loading") {
    status = "checking"
  } else if (updateAvailable) {
    status = "updateAvailable"
  } else if (availability === "error") {
    // Before the installed-state branches: offline, the row used to keep
    // claiming "Up to date", which the app has no way to know.
    status = "checkFailed"
  } else if (isInstalled) {
    status = "upToDate"
  } else {
    status = "notInstalled"
  }

  // A paused (unchecked) miniapp offers no actions — re-check it to act.
  const showAction = enabled && (canAct || busy || failed)

  let action: StoreRowState["action"] = null
  if (showAction) {
    action = failed && !busy ? "retry" : isInstalled ? "update" : "install"
  }

  return {
    status,
    showAction,
    action,
    emphasise: busy || updateAvailable,
  }
}
