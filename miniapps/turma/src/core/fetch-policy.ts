/**
 * What the phone WebView is allowed to ask the background to fetch.
 *
 * `turma:fetch` exists because the WebView runs from file://, where a
 * cross-origin request to the hub is CORS-fragile. Left unrestricted it is an
 * open proxy: the WebView could reach any origin the *phone* can — other
 * services on the user's LAN, link-local metadata addresses, localhost — and
 * read the response.
 *
 * The policy is a pure function so it can be tested without a simulator or a
 * live socket; the handler in background/index.ts only transports.
 */

export type FetchDecision =
  | {allow: true; /** Full response body, or status only? */ withBody: boolean}
  | {allow: false; reason: string}

export interface FetchPolicyInput {
  url: string
  method: string
  /** Origin of the hub the user has configured, or null when unset. */
  hubOrigin: string | null
}

export function decideFetch({url, method, hubOrigin}: FetchPolicyInput): FetchDecision {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return {allow: false, reason: "turma:fetch: malformed URL"};
  }

  // http(s) only. Off-device this blocks file://; on-device the polyfill's
  // OkHttp path throws on anything else, taking the dispatcher with it.
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return {allow: false, reason: `turma:fetch: refused scheme ${target.protocol}`};
  }

  // Credentials in the authority are a classic way to make a URL *look* like
  // it points at the hub while resolving elsewhere.
  if (target.username || target.password) {
    return {allow: false, reason: "turma:fetch: refused URL with embedded credentials"};
  }

  if (hubOrigin !== null && target.origin === hubOrigin) {
    return {allow: true, withBody: true};
  }

  // phone-login validates credentials against a hub the user has just typed,
  // before it is saved (postLogin runs ahead of saveConfig), so the sign-in
  // probe is the one call allowed to reach another origin. Exact path, no
  // query, no fragment — and status only. phone-login branches on ok/status
  // and never reads the body, so returning it would hand the WebView a read
  // primitive against any host the phone can reach.
  const isLoginProbe =
    method.toUpperCase() === "POST" &&
    target.pathname === "/api/login" &&
    target.search === "" &&
    target.hash === "";

  if (isLoginProbe) {
    return {allow: true, withBody: false};
  }

  return {
    allow: false,
    reason: `turma:fetch: refused ${target.origin} (configured hub is ${hubOrigin ?? "unset"})`,
  };
}

/**
 * How long a proxied request may run before it is abandoned.
 *
 * A host that accepts the connection and then never answers left the RPC
 * pending forever, so the phone page waited on a promise that could not settle.
 */
export const FETCH_TIMEOUT_MS = 20_000;
