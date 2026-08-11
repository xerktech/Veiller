import { describe, expect, test } from "bun:test";

import { decideFetch } from "./fetch-policy.ts";

const HUB = "https://hub.example.com";

const decide = (url: string, method = "GET", hubOrigin: string | null = HUB) =>
  decideFetch({ url, method, hubOrigin });

describe("turma:fetch policy", () => {
  test("allows the configured hub, with the response body", () => {
    const d = decide(`${HUB}/api/sessions`);
    expect(d).toEqual({ allow: true, withBody: true });
  });

  test("allows any path and method on the configured hub", () => {
    expect(decide(`${HUB}/api/anything?q=1#x`, "POST")).toEqual({ allow: true, withBody: true });
    expect(decide(`${HUB}/`, "DELETE")).toEqual({ allow: true, withBody: true });
  });

  test("refuses another origin", () => {
    const d = decide("https://evil.example.com/secret");
    expect(d.allow).toBe(false);
  });

  test("refuses LAN, loopback and link-local hosts", () => {
    for (const url of [
      "http://127.0.0.1:8080/secret",
      "http://192.168.1.10/admin",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/secret",
    ]) {
      expect(decide(url).allow).toBe(false);
    }
  });

  test("refuses non-http(s) schemes", () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/x", "data:text/plain,hi"]) {
      const d = decide(url);
      expect(d.allow).toBe(false);
      if (!d.allow) expect(d.reason).toContain("scheme");
    }
  });

  test("refuses a malformed URL", () => {
    expect(decide("not a url").allow).toBe(false);
  });

  test("refuses credentials embedded in the authority", () => {
    // `http://hub.example.com@evil.example.com/` resolves to evil, but reads
    // as the hub at a glance.
    const d = decide("http://hub.example.com@evil.example.com/api/login", "POST");
    expect(d.allow).toBe(false);
  });

  describe("the sign-in probe", () => {
    // phone-login posts to a hub the user has just typed, before it is saved.
    test("is allowed cross-origin, but WITHOUT the body", () => {
      const d = decide("https://typed-by-user.example.com/api/login", "POST");
      expect(d).toEqual({ allow: true, withBody: false });
    });

    test("must be a POST", () => {
      expect(decide("https://other.example.com/api/login", "GET").allow).toBe(false);
    });

    test("must be exactly /api/login — no query, no fragment, no traversal", () => {
      for (const url of [
        "https://other.example.com/api/login?x=1",
        "https://other.example.com/api/login#frag",
        "https://other.example.com/api/login/../secret",
        "https://other.example.com/API/login",
        "https://other.example.com/api/login/extra",
      ]) {
        expect(decide(url, "POST").allow).toBe(false);
      }
    });

    test("still applies when no hub is configured yet", () => {
      expect(decide("https://first-hub.example.com/api/login", "POST", null)).toEqual({
        allow: true,
        withBody: false,
      });
      expect(decide("https://first-hub.example.com/api/sessions", "GET", null).allow).toBe(false);
    });
  });
});
