// The transport half of the background's `turma:fetch` RPC (background/index.ts).
//
// `decideFetch` (fetch-policy.ts) decides WHAT may be reached and whether the
// body comes back; this does the reaching, under a single abort deadline that
// covers the WHOLE response — headers AND body — and always resolves to a value
// the phone page can branch on. It is pulled out of the handler so the deadline
// behaviour is unit-testable with an injected fetch, the way decideFetch is.
//
// The deadline must span the body read, not just the fetch (XERK-336). A hub
// that sends headers and then stalls mid-body would slip past a timer scoped to
// `fetch` alone: `res.text()` is a second, unbounded await on the same socket,
// which leaks the socket and hangs the RPC — and its caller — for good. Aborting
// across both tears the stalled body stream down instead.

/** Exactly what the `turma:fetch` RPC returns — a Response the UI can branch on. */
export interface ProxyFetchResult {
  status: number;
  ok: boolean;
  bodyText: string;
}

export interface ProxyFetchInput {
  url: string;
  method: string;
  headers?: Record<string, string>;
  /** String bodies only — the background fetch polyfill takes strings. */
  body?: string;
}

export async function proxyFetchWithDeadline(
  doFetch: typeof fetch,
  input: ProxyFetchInput,
  opts: { timeoutMs: number; withBody: boolean },
): Promise<ProxyFetchResult> {
  const { timeoutMs, withBody } = opts;
  // The JSContext this runs in has AbortController; the original handler already
  // relied on it. No typeof guard, so an absent one is a loud failure rather
  // than a silently-unbounded read.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await doFetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: abort.signal,
    });

    if (!withBody) {
      return { status: res.status, ok: res.ok, bodyText: "" };
    }

    try {
      // Still under the abort deadline: a stall here aborts the body stream and
      // rejects, rather than hanging.
      return { status: res.status, ok: res.ok, bodyText: await res.text() };
    } catch (err) {
      // A body that can't be read is not a transport failure of its own — keep
      // the status we already have. A mid-body stall reads as a timeout with the
      // REAL status (not a bare 0), so the UI shows the hub's slowness rather
      // than the flat "hub unreachable" a status-less failure would flash.
      return {
        status: res.status,
        ok: false,
        bodyText: abort.signal.aborted
          ? `turma:fetch: timed out after ${timeoutMs}ms`
          : `turma:fetch: could not read body: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } catch (err) {
    // A network failure (or an abort before headers arrive) used to escape as an
    // unhandled rejection and tear down the caller; the UI expects a value.
    const aborted = abort.signal.aborted;
    return {
      status: 0,
      ok: false,
      bodyText: aborted
        ? `turma:fetch: timed out after ${timeoutMs}ms`
        : `turma:fetch: request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
