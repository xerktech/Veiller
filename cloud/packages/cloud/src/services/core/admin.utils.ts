/**
 * @fileoverview Shared Veiller admin utilities.
 *
 * Centralizes the logic for determining whether a user is a Veiller
 * platform admin.  A user is considered an admin when:
 *
 *  1. Their email ends with `@mentra.glass`, OR
 *  2. Their email ends with `@mentraglass.com`, OR
 *  3. Their email appears in the `ADMIN_EMAILS` environment variable
 *     (comma-separated list).
 *
 * This module is intentionally dependency-free (no database calls, no
 * framework imports) so it can be used from services, middleware, and
 * route handlers without circular-dependency issues.
 */

/** Veiller admin email domains (lowercase). */
const VEILLER_ADMIN_DOMAINS: readonly string[] = ["@mentra.glass", "@mentraglass.com"];

/**
 * Parse the `ADMIN_EMAILS` env var into a Set of lowercase addresses.
 *
 * The set is rebuilt on every call so that hot-reloaded env changes are
 * picked up without a server restart.  The cost is negligible for the
 * small lists we expect here.
 */
function getAdminEmailSet(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Check whether an email address belongs to a Veiller platform admin.
 *
 * @param email - The email to check (case-insensitive).
 * @returns `true` when the email is recognized as a Veiller admin.
 *
 * @example
 * ```ts
 * import { isVeillerAdmin } from "../../services/core/admin.utils";
 *
 * if (!isVeillerAdmin(userEmail)) {
 *   return c.json({ error: "Admin access required" }, 403);
 * }
 * ```
 */
export function isVeillerAdmin(email: string): boolean {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  // 1. Domain-based check
  for (const domain of VEILLER_ADMIN_DOMAINS) {
    if (normalized.endsWith(domain)) {
      return true;
    }
  }

  // 2. Explicit allow-list from environment
  if (getAdminEmailSet().has(normalized)) {
    return true;
  }

  return false;
}

/**
 * The list of recognized Veiller admin email domains.
 * Exported for use in log messages or documentation; prefer calling
 * {@link isVeillerAdmin} for actual authorization checks.
 */
export { VEILLER_ADMIN_DOMAINS };
