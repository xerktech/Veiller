import { describe, expect, mock, test } from "bun:test";

import { proxyFetchWithDeadline } from "./proxy-transport.ts";

const REQ = { url: "https://hub.example.com/api/agents", method: "GET" as const };
const OPTS = { timeoutMs: 20_000, withBody: true };

// A fetch that resolves headers immediately but whose body read never settles —
// the mid-body stall XERK-336 is about. The signal handed in is what tears it
// down: reject the body read as an AbortError when it fires.
function headersThenStalledBody(): { fetch: typeof fetch } {
  const doFetch = mock((_url: unknown, init?: RequestInit) => {
    const signal = init?.signal;
    return Promise.resolve({
      status: 200,
      ok: true,
      text: () =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    } as unknown as Response);
  });
  return { fetch: doFetch as unknown as typeof fetch };
}

describe("proxyFetchWithDeadline (XERK-336)", () => {
  test("returns the body when the whole response arrives in time", async () => {
    const doFetch = mock(() =>
      Promise.resolve({ status: 200, ok: true, text: async () => "hello" } as unknown as Response),
    ) as unknown as typeof fetch;

    const res = await proxyFetchWithDeadline(doFetch, REQ, OPTS);
    expect(res).toEqual({ status: 200, ok: true, bodyText: "hello" });
  });

  test("passes an abort signal through to the underlying fetch", async () => {
    let seen: AbortSignal | undefined;
    const doFetch = mock((_url: unknown, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return Promise.resolve({ status: 200, ok: true, text: async () => "" } as unknown as Response);
    }) as unknown as typeof fetch;

    await proxyFetchWithDeadline(doFetch, REQ, OPTS);
    expect(seen).toBeInstanceOf(AbortSignal);
  });

  test("bounds a stalled BODY read, not just the response — the socket leak", async () => {
    const { fetch } = headersThenStalledBody();
    // A short deadline so the real timer fires quickly; the point is that the
    // body read is under it at all, which the pre-fix code (timer cleared once
    // headers arrived) got wrong.
    const res = await proxyFetchWithDeadline(fetch, REQ, { timeoutMs: 20, withBody: true });

    // It settled at all (didn't hang) AND reports a timeout carrying the REAL
    // status, so the UI shows hub slowness, not a flat status-less "unreachable".
    expect(res.ok).toBe(false);
    expect(res.status).toBe(200);
    expect(res.bodyText).toBe("turma:fetch: timed out after 20ms");
  });

  test("a fetch that never resolves headers times out as a status-0 transport failure", async () => {
    const doFetch = mock((_url: unknown, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    }) as unknown as typeof fetch;

    const res = await proxyFetchWithDeadline(doFetch, REQ, { timeoutMs: 20, withBody: true });
    expect(res).toEqual({ status: 0, ok: false, bodyText: "turma:fetch: timed out after 20ms" });
  });

  test("a network failure before headers is reported, not thrown", async () => {
    const doFetch = mock(() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;

    const res = await proxyFetchWithDeadline(doFetch, REQ, OPTS);
    expect(res.status).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.bodyText).toBe("turma:fetch: request failed: ECONNREFUSED");
  });

  test("withBody:false returns the status with an empty body and never reads it", async () => {
    const textCalled = mock(async () => "should not be read");
    const doFetch = mock(() =>
      Promise.resolve({ status: 204, ok: true, text: textCalled } as unknown as Response),
    ) as unknown as typeof fetch;

    const res = await proxyFetchWithDeadline(doFetch, REQ, { timeoutMs: 20_000, withBody: false });
    expect(res).toEqual({ status: 204, ok: true, bodyText: "" });
    expect(textCalled).not.toHaveBeenCalled();
  });

  test("a non-abort body-read error keeps the status and reports the read failure", async () => {
    const doFetch = mock(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        text: async () => {
          throw new Error("bad chunk");
        },
      } as unknown as Response),
    ) as unknown as typeof fetch;

    const res = await proxyFetchWithDeadline(doFetch, REQ, OPTS);
    expect(res).toEqual({
      status: 200,
      ok: false,
      bodyText: "turma:fetch: could not read body: bad chunk",
    });
  });
});
