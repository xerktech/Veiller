import * as Linking from "expo-linking"
import {FC, ReactNode, createContext, useContext, useEffect, useRef} from "react"

import {useSplashLoader} from "@/contexts/SplashLoaderProvider"
import {BgTimer} from "@veiller/engine"
import mantle from "@/services/MantleManager"
import {deeplinkKey, planDeeplink, type DeeplinkPlan} from "@/services/deeplink/planDeeplink"
import {useNavigationStore} from "@/stores/navigation"

export interface DeepLinkRoute {
  pattern: string
  handler: (url: string, params: Record<string, string>) => void | Promise<void>
}

/**
 * Define all deep link routes for the app.
 *
 * Veiller has no user account / login (XERK-198), so no route requires auth
 * and there are no /auth/* routes. Individual miniapps handle their own auth if
 * they need it.
 */
const deepLinkRoutes: DeepLinkRoute[] = [
  // Home routes
  {
    pattern: "/",
    handler: (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      // Let the app's index route handle the boot/navigation logic.
      nav.replace("/")
    },
  },
  {
    pattern: "/home",
    handler: (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      // processUrl guarantees the app has booted before any handler runs, so
      // the built-in catalog is registered by the time we get here.
      nav.replaceAll("/home")
    },
  },

  {
    // A real file route, but it still needs a pattern here: without one,
    // processUrl fell through to the fallback handler, which replaces to "/"
    // and boots the app a second time (~20s of extra splash) before landing on
    // home instead of the store.
    pattern: "/miniapps/store",
    handler: (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      nav.push("/miniapps/store")
    },
  },

  // Settings routes
  {
    pattern: "/settings",
    handler: (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      nav.push("/miniapps/settings/main")
    },
  },
  {
    pattern: "/miniapps/settings/:section",
    handler: (url: string, params: Record<string, string>) => {
      const {section} = params
      const nav = useNavigationStore.getState()
      // Map section names to actual routes
      // Every entry must name a route that exists under mobile/src/app —
      // an unknown target lands the user on expo-router's "Unmatched Route"
      // screen. "developer" (removed by XERK-214) and "theme" (folded into
      // appearance) used to be listed here and had no such route.
      const sectionRoutes: Record<string, string> = {
        "privacy": "/miniapps/settings/privacy",
        "appearance": "/miniapps/settings/appearance",
        "dashboard": "/miniapps/settings/dashboard",
        "glasses": "/miniapps/settings/glasses",
        "microphone": "/miniapps/settings/microphone",
        "notifications": "/miniapps/settings/notifications",
        "speech": "/miniapps/settings/speech",
        "device-info": "/miniapps/settings/device-info",
        // Test/benchmark route — only useful behind Super Mode.
        "stress-test": "/miniapps/settings/stress-test",
      }

      const route = sectionRoutes[section]
      if (route) {
        // Pass through query params — stress-test uses them
        const qsKeys = ["mb", "n", "autorun", "url", "jsc"]
        const qs = qsKeys
          .filter((k) => params[k] != null)
          .map((k) => `${k}=${encodeURIComponent(params[k])}`)
          .join("&")
        const fullRoute = qs ? `${route}?${qs}` : route
        nav.push(fullRoute as any)
      } else {
        nav.push("/settings")
      }
    },
  },

  // Glasses management routes
  {
    pattern: "/glasses",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      nav.push("/miniapps/settings/glasses")
    },
  },
  // XERK-200/XERK-206: ASG gallery route removed while the camera miniapp is parked.
  // {
  //   pattern: "/asg/gallery",
  //   handler: (url: string, params: Record<string, string>) => {
  //     const nav = useNavigationStore.getState()
  //     nav.push("/asg/gallery")
  //   },
  // },

  // Pairing routes
  {
    pattern: "/pairing",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      // The model picker, not /pairing/prep: prep renders a per-model guide
      // and has nothing to show without a deviceModel param.
      nav.push("/pairing/select-glasses-model")
    },
  },
  {
    pattern: "/pairing/:step",
    handler: (url: string, params: Record<string, string>) => {
      const {step} = params
      const nav = useNavigationStore.getState()

      // "guide" and "bluetooth" had no route; the guide is /pairing/prep and
      // the Bluetooth-classic step is /pairing/btclassic.
      const pairingRoutes: Record<string, string> = {
        // "guide"/"prep" render a per-model guide, which needs a deviceModel
        // the URL does not carry — send them to the picker that supplies one.
        "guide": "/pairing/select-glasses-model",
        "prep": "/pairing/select-glasses-model",
        // NOT /pairing/btclassic: that screen calls focusEffectPreventBack()
        // and its header back button is commented out, so a deep link into it
        // traps the app — Back does nothing and only a force-stop escapes. It
        // is a step inside the pairing flow, reachable from it, not an entry
        // point.
        "bluetooth": "/pairing/select-glasses-model",
        "btclassic": "/pairing/select-glasses-model",
        // "scan" needs a deviceModel just as much as guide/prep do — without
        // one it renders "Scanning for " and the native scan throws
        // "Cannot convert 'undefined' to a Kotlin type".
        "scan": "/pairing/select-glasses-model",
        "select-glasses": "/pairing/select-glasses-model",
        "wifi-setup": "/wifi/scan",
      }

      const route = pairingRoutes[step]
      if (route) {
        nav.push(route as any)
      } else {
        nav.push("/pairing/select-glasses-model")
      }
    },
  },

  // Mirror/Gallery routes
  //
  // XERK-200/XERK-206: the ASG gallery is parked with the camera miniapp, so
  // there is no /mirror/gallery route. Registering the pattern anyway sent the
  // user to expo-router's "Unmatched Route" screen; leave it unregistered so
  // the link falls through to the fallback handler (home) instead.
  // {
  //   pattern: "/mirror/gallery",
  //   handler: async (url: string, params: Record<string, string>) => {
  //     const nav = useNavigationStore.getState()
  //     nav.push("/mirror/gallery")
  //   },
  // },
  {
    pattern: "/mirror/video/:videoId",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      const {videoId} = params
      nav.push(`/mirror/video-player?videoId=${videoId}`)
    },
  },

  // Search routes
  //
  // There is no search screen in this fork — /search/search does not exist
  // under mobile/src/app. Kept commented rather than pointing at a route that
  // renders "Unmatched Route".
  // {
  //   pattern: "/search",
  //   handler: async (url: string, params: Record<string, string>) => {
  //     const nav = useNavigationStore.getState()
  //     const {q} = params
  //     const route = q ? `/search/search?q=${encodeURIComponent(q)}` : "/search/search"
  //     nav.push(route as any)
  //   },
  // },

  // Onboarding routes
  {
    pattern: "/welcome",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      nav.push("/onboarding/welcome")
    },
  },
  {
    pattern: "/onboarding/welcome",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      nav.push("/onboarding/welcome")
    },
  },

  // Universal app link routes (for apps.mentraglass.com). The /applet/webview
  // target for Cloud V1 apps is gone (Cloud V1 app end-of-life); app links
  // land on the installed app's info screen instead.
  {
    // `/package/:packageName` is the ONLY path the manifest autoVerifies, so it
    // is what every link from the web arrives on.
    //
    // There is deliberately no `app/package/[packageName].tsx` file route. A
    // file route and this table cannot both own a path: expo-router mounts the
    // file route, this table's fallback then fires `replaceAll("/")` on top of
    // it, and the user lands on home. Leaving the path unrouted sends it
    // through `+not-found`, which hands it here — exactly how `/apps/` works.
    pattern: "/package/:packageName",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      const {packageName} = params
      nav.push(`/applet/settings?packageName=${encodeURIComponent(packageName)}`)
    },
  },
  {
    pattern: "/apps/:packageName",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      const {packageName} = params
      nav.push(`/applet/settings?packageName=${encodeURIComponent(packageName)}`)
    },
  },
  {
    pattern: "/apps/:packageName/settings",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      const {packageName} = params
      nav.push(`/applet/settings?packageName=${encodeURIComponent(packageName)}`)
    },
  },
]

interface DeeplinkContextType {
  processUrl: (url: string) => Promise<void>
  /**
   * What processUrl would do with this URL right now, without doing it.
   * `+not-found` needs this to decide whether resetting to home first is safe:
   * clearing history and then declining to navigate strands the user.
   */
  planFor: (url: string) => DeeplinkPlan
}

const DeeplinkContext = createContext<DeeplinkContextType>({} as DeeplinkContextType)

export const useDeeplink = () => useContext(DeeplinkContext)

export const DeeplinkProvider: FC<{children: ReactNode}> = ({children}) => {
  const {setSplashEnabled} = useSplashLoader()
  const nav = useNavigationStore.getState()
  const config = {
    scheme: "com.xerktech.veiller",
    host: "apps.mentraglass.com",
    routes: deepLinkRoutes,
    fallbackHandler: (url: string) => {
      console.warn("Fallback handler called for URL:", url)
      setTimeout(() => {
        nav.replaceAll("/")
      }, 100)
    },
  }

  const handleUrlRaw = async ({url}: {url: string}) => {
    processUrl(url, false)
  }

  useEffect(() => {
    Linking.addEventListener("url", handleUrlRaw)
    Linking.getInitialURL().then((url) => {
      console.log("@@@@@@@@@@@@@ INITIAL URL @@@@@@@@@@@@@@@", url)
      if (url) {
        processUrl(url, true)
      }
    })
  }, [])

  /**
   * Find matching route for the given URL
   */
  /**
   * The path a route pattern is matched against.
   *
   * For the custom scheme, `com.xerktech.veiller://pairing/bluetooth` parses
   * with host "pairing" and pathname "/bluetooth", so the host has to be
   * folded back in to recover "/pairing/bluetooth". Both matching AND param
   * extraction must use this — they used to disagree, so every `:param` in an
   * app-scheme URL came out one segment short (empty), silently disabling
   * /apps/:packageName, /package/:packageName, /pairing/:step,
   * /miniapps/settings/:section and /mirror/video/:videoId.
   */
  const effectivePathname = (url: URL): string => {
    const host = url.host
    const isAppScheme = url.protocol === `${config.scheme}:`
    return isAppScheme && host ? `/${host}${url.pathname}` : url.pathname
  }

  const findMatchingRoute = (url: URL): DeepLinkRoute | null => {
    const pathname = effectivePathname(url)

    for (const route of config.routes) {
      if (matchesPattern(pathname, route.pattern)) {
        return route
      }
    }

    return null
  }

  /**
   * Check if pathname matches the route pattern
   */
  const matchesPattern = (pathname: string, pattern: string): boolean => {
    // Convert pattern to regex
    // /user/:id -> /user/([^/]+)
    const regexPattern = pattern.replace(/:[^/]+/g, "([^/]+)").replace(/\*/g, ".*")

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(pathname)
  }

  const extractParams = (url: URL, pattern: string): Record<string, string> => {
    const params: Record<string, string> = {}

    // Extract path parameters — against the same path findMatchingRoute used.
    const pathParts = effectivePathname(url).split("/").filter(Boolean)
    const patternParts = pattern.split("/").filter(Boolean)

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]
      const pathPart = pathParts[i]

      if (patternPart.startsWith(":")) {
        const paramName = patternPart.slice(1)
        params[paramName] = pathPart || ""
      }
    }

    // Extract query parameters
    url.searchParams.forEach((value, key) => {
      params[key] = value
    })

    return params
  }

  // Refs, not locals: these were plain `let`s in the provider body, so every
  // re-render reset them. That made the dedup window simultaneously useless
  // (real duplicates got through and pushed the same screen twice) and harmful
  // (a stale record survived long enough to swallow the legitimate replay of a
  // pending route after boot). XERK-249.
  const lastDispatched = useRef<{url: string | null; at: number}>({url: null, at: 0})
  /**
   * The URL we have already deferred pending a boot. Deliberately separate from
   * nav's pendingRoute, which other code (and processUrl's own `initial`
   * branch) also writes.
   */
  const bootDeferredFor = useRef<string | null>(null)

  const processUrl = async (url: string, initial: boolean = false) => {
    try {

      // Every decision about this URL — ignore / defer for boot / duplicate /
      // dispatch — is made by planDeeplink, which is pure and unit tested. See
      // services/deeplink/planDeeplink.ts for why.
      const plan = planDeeplink({
        url,
        isInitialized: mantle.isInitialized,
        bootDeferredFor: bootDeferredFor.current,
        lastDispatched: lastDispatched.current,
        now: Date.now(),
        initial,
      })

      if (plan.kind === "ignore") {
        console.log("DEEPLINK: ignoring —", plan.reason)
        return
      }
      if (plan.kind === "duplicate") {
        console.log("DEEPLINK: Ignoring duplicate URL")
        return
      }
      if (plan.kind === "already-deferred") {
        console.log("DEEPLINK: boot already pending for", url)
        return
      }
      if (plan.kind === "defer-for-boot") {
        console.log("DEEPLINK: app not initialized yet — booting through / and replaying", url)
        bootDeferredFor.current = deeplinkKey(url)
        nav.setPendingRoute(url)
        nav.replace("/")
        return
      }

      // For initial URLs (cold start), set the pending route BEFORE the delay.
      // This prevents a race condition where index.tsx init completes during the
      // delay and calls navigateToDestination() before the pending route is set,
      // causing it to navigate to /home instead of the deep link target.
      if (initial) {
        nav.setPendingRoute(url)
        await new Promise((resolve) => setTimeout(resolve, 1000))
        // If index.tsx already consumed and re-processed the pending route
        // during the delay, don't double-process it
        if (nav.getPendingRoute() !== url) {
          console.log("DEEPLINK: Pending route was consumed during delay, skipping")
          return
        }
      }

      // small hack since some sources strip the host and we want to put the url into URL object here
      if (url.startsWith("/")) {
        url = "https://apps.mentraglass.com" + url
      }

      const parsedUrl = new URL(url)
      const matchedRoute = findMatchingRoute(parsedUrl)

      if (!matchedRoute) {
        console.warn("No matching route found for URL:", url)
        config.fallbackHandler?.(url)
        return
      }

      // Extract parameters from URL
      const params = extractParams(parsedUrl, matchedRoute.pattern)
      if (!initial) {
        params.preloaded = "true"
      }

      try {
        // Recorded now that a route matched and the handler is about to run:
        // this is the point at which a second delivery really would be a
        // repeat. Recording on entry marked calls that then bailed out as
        // handled, which swallowed the one call that would have navigated.
        lastDispatched.current = {url, at: Date.now()}
        console.log("@@@@@@@@@@@@@ MATCHED ROUTE @@@@@@@@@@@@@@@", matchedRoute)
        console.log("@@@@@@@@@@@@@ PARAMS @@@@@@@@@@@@@@@", params)
        console.log("@@@@@@@@@@@@@ URL @@@@@@@@@@@@@@@", url)
        setSplashEnabled(true)
        BgTimer.setTimeout(async () => {
          await matchedRoute.handler(url, params)
          BgTimer.setTimeout(() => {
            setSplashEnabled(false)
          }, 2500)
        }, 100)
      } catch (error) {
        console.warn("Route handler failed, router may not be ready:", error)
      }
    } catch (error) {
      console.error("Error handling deep link:", error)
      config.fallbackHandler?.(url)
    }
  }

  const planFor = (url: string): DeeplinkPlan =>
    planDeeplink({
      url,
      isInitialized: mantle.isInitialized,
      bootDeferredFor: bootDeferredFor.current,
      lastDispatched: lastDispatched.current,
      now: Date.now(),
      initial: false,
    })

  const contextValue: DeeplinkContextType = {
    processUrl,
    planFor,
  }

  return <DeeplinkContext.Provider value={contextValue}>{children}</DeeplinkContext.Provider>
}
