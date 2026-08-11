import {
  DEDUP_WINDOW_MS,
  deeplinkKey,
  decideNotFoundAction,
  mayRescueToHome,
  planDeeplink,
  shouldResetToHomeBeforeHandoff,
  type DeeplinkPlanInput,
} from "./planDeeplink"

const base: DeeplinkPlanInput = {
  url: "com.xerktech.veiller://settings",
  isInitialized: true,
  bootDeferredFor: null,
  lastDispatched: {url: null, at: 0},
  now: 10_000,
  initial: false,
}

const plan = (over: Partial<DeeplinkPlanInput> = {}) => planDeeplink({...base, ...over})

describe("planDeeplink", () => {
  it("dispatches an ordinary link once the app has booted", () => {
    expect(plan().kind).toBe("dispatch")
  })

  it("ignores Expo dev-client URLs", () => {
    expect(plan({url: "com.xerktech.veiller://expo-development-client/?url=x"}).kind).toBe("ignore")
  })

  describe("before boot", () => {
    // mantle.init() registers the built-in miniapp catalog. Anything that
    // reaches home before it renders a home screen with no Settings tile, no
    // Glasses Mirror and no bottom bar, unrecoverable without a force-stop.
    it("defers so the index route can boot the app", () => {
      expect(plan({isInitialized: false}).kind).toBe("defer-for-boot")
    })

    it("defers regardless of how the URL was delivered", () => {
      expect(plan({isInitialized: false, initial: true}).kind).toBe("defer-for-boot")
    })

    it("does not defer twice for the same link", () => {
      // Two entry points deliver a cold link. Booting twice remounts the index
      // route, and the second instance wipes the first's replay.
      expect(
        plan({isInitialized: false, bootDeferredFor: deeplinkKey(base.url)}).kind,
      ).toBe("already-deferred")
    })

    it("still defers when a DIFFERENT URL is already pending", () => {
      // The guard must key on the URL, not merely on "something is pending" —
      // otherwise a second, different link is silently dropped.
      expect(
        plan({
          isInitialized: false,
          bootDeferredFor: deeplinkKey("com.xerktech.veiller://glasses"),
        }).kind,
      ).toBe("defer-for-boot")
    })

    it("takes priority over the dedup window", () => {
      // A pre-boot repeat must still boot; treating it as a duplicate would
      // leave the app never started.
      expect(
        plan({
          isInitialized: false,
          lastDispatched: {url: base.url, at: base.now - 100},
        }).kind,
      ).toBe("defer-for-boot")
    })
  })

  describe("duplicate suppression", () => {
    it("suppresses the same URL inside the window", () => {
      expect(plan({lastDispatched: {url: base.url, at: base.now - 500}}).kind).toBe("duplicate")
    })

    it("allows it again once the window has passed", () => {
      expect(
        plan({lastDispatched: {url: base.url, at: base.now - DEDUP_WINDOW_MS - 1}}).kind,
      ).toBe("dispatch")
    })

    it("never suppresses a different URL", () => {
      expect(
        plan({lastDispatched: {url: "com.xerktech.veiller://glasses", at: base.now - 10}}).kind,
      ).toBe("dispatch")
    })

    it("never suppresses the cold-start delivery", () => {
      // The post-boot replay arrives shortly after the deferral; treating it as
      // a repeat is what silently dropped cold deep links onto home.
      expect(
        plan({initial: true, lastDispatched: {url: base.url, at: base.now - 10}}).kind,
      ).toBe("dispatch")
    })
  })
})

describe("shouldResetToHomeBeforeHandoff", () => {
  it("resets only when the handoff will actually navigate", () => {
    expect(shouldResetToHomeBeforeHandoff({kind: "dispatch"})).toBe(true)
  })

  it("does not reset when nothing will navigate", () => {
    // Clearing history and then declining to navigate is what stranded the
    // user on home after a duplicate delivery, and what produced the crippled
    // pre-boot home.
    for (const kind of ["defer-for-boot", "already-deferred", "duplicate"] as const) {
      expect(shouldResetToHomeBeforeHandoff({kind})).toBe(false)
    }
    expect(shouldResetToHomeBeforeHandoff({kind: "ignore", reason: "x"})).toBe(false)
  })
})

describe("decideNotFoundAction", () => {
  it("pops on a repeat delivery, rather than resetting to home", () => {
    // The branch every warm deep link takes. Resetting instead threw away the
    // screen the first delivery had just opened.
    expect(decideNotFoundAction({kind: "duplicate"})).toEqual({kind: "pop"})
  })

  it("resets to home first when something will navigate", () => {
    expect(decideNotFoundAction({kind: "dispatch"})).toEqual({kind: "reset-then-handoff"})
  })

  it("does not touch history when nothing will navigate yet", () => {
    for (const kind of ["defer-for-boot", "already-deferred"] as const) {
      expect(decideNotFoundAction({kind})).toEqual({kind: "handoff"})
    }
  })
})

describe("mayRescueToHome", () => {
  it("allows the rescue once booted and still mounted", () => {
    expect(mayRescueToHome({isMounted: true, isInitialized: true})).toBe(true)
  })

  it("refuses before boot", () => {
    // Going home pre-boot produces the crippled home — no Settings tile, no
    // Glasses Mirror, no bottom bar — that the deferral exists to prevent.
    expect(mayRescueToHome({isMounted: true, isInitialized: false})).toBe(false)
  })

  it("refuses once unmounted", () => {
    expect(mayRescueToHome({isMounted: false, isInitialized: true})).toBe(false)
  })
})

describe("deeplinkKey", () => {
  // One tap can arrive as two strings: +not-found rebuilds the path with the
  // app scheme while getInitialURL reports the original https App Link.
  // Treating them as different links deferred the boot twice and mounted the
  // index route twice — the race that wiped a replay in an earlier round.
  it("treats the App Link and the app-scheme form as one link", () => {
    expect(deeplinkKey("https://apps.mentraglass.com/package/com.xerktech.turma")).toBe(
      deeplinkKey("com.xerktech.veiller://package/com.xerktech.turma"),
    )
  })

  it("keeps the path and query", () => {
    expect(deeplinkKey("com.xerktech.veiller://settings?section=privacy")).toBe(
      "/settings?section=privacy",
    )
  })

  it("still separates genuinely different links", () => {
    expect(deeplinkKey("com.xerktech.veiller://settings")).not.toBe(
      deeplinkKey("com.xerktech.veiller://glasses"),
    )
  })

  it("ignores a trailing slash", () => {
    expect(deeplinkKey("com.xerktech.veiller://settings/")).toBe(
      deeplinkKey("com.xerktech.veiller://settings"),
    )
  })
})

describe("planDeeplink — link identity", () => {
  it("does not defer the same link twice under two spellings", () => {
    expect(
      planDeeplink({
        ...base,
        url: "https://apps.mentraglass.com/package/x",
        isInitialized: false,
        bootDeferredFor: deeplinkKey("com.xerktech.veiller://package/x"),
      }).kind,
    ).toBe("already-deferred")
  })

  it("suppresses a repeat delivered under the other spelling", () => {
    expect(
      planDeeplink({
        ...base,
        url: "https://apps.mentraglass.com/package/x",
        lastDispatched: {url: "com.xerktech.veiller://package/x", at: base.now - 100},
      }).kind,
    ).toBe("duplicate")
  })
})
