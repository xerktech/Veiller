import * as Linking from "expo-linking"
import {FC, ReactNode, createContext, useContext, useEffect, useRef} from "react"

import {useSplashLoader} from "@/contexts/SplashLoaderProvider"
import {BgTimer} from "@veiller/engine"
import mantle from "@/services/MantleManager"
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
        "bluetooth": "/pairing/btclassic",
        "btclassic": "/pairing/btclassic",
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
    // The verified App Link declared in app.config.ts is `/package/` — that is
    // the path the manifest autoVerifies and the only one a browser will hand
    // us. Only `/apps/` was registered, so every verified link fell through to
    // the fallback handler and did nothing.
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
      nav.push(`/applet/settings?packageName=${packageName}`)
    },
  },
  {
    pattern: "/apps/:packageName/settings",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      const {packageName} = params
      nav.push(`/applet/settings?packageName=${packageName}`)
    },
  },
]

interface DeeplinkContextType {
  processUrl: (url: string) => Promise<void>
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
  const lastProcessed = useRef<{url: string | null; at: number}>({url: null, at: 0})
  /**
   * The URL we have already deferred pending a boot. Deliberately separate from
   * nav's pendingRoute, which other code (and processUrl's own `initial`
   * branch) also writes.
   */
  const bootDeferredFor = useRef<string | null>(null)

  const processUrl = async (url: string, initial: boolean = false) => {
    try {
      // ignore expo-dev-deeplinks: (this was causing android to restart the app after hot-reloads twice)
      if (url.includes("expo-development-client")) {
        console.log("DEEPLINK: Ignoring expo-development-client URL")
        return
      }

      // Deduplicate — iOS can fire the same universal link event multiple times,
      // and on cold start both getInitialURL and addEventListener fire for the
      // same URL. Initial calls skip the check but claim the URL so that the
      // duplicate addEventListener call is blocked. The index.tsx re-processing
      // call happens >2s later (1s initial delay + init time + 1s DEEPLINK_DELAY)
      // so it naturally falls outside the dedup window.
      const now = Date.now()
      if (!initial && url === lastProcessed.current.url && now - lastProcessed.current.at < 3000) {
        console.log("DEEPLINK: Ignoring duplicate URL")
        return
      }
      // NB: the URL is claimed at dispatch (below), not here. Claiming it up
      // front marked as "processed" every call that then bailed out — deferred
      // for boot, or skipped because the pending route was consumed — so the
      // one call that actually would have navigated got suppressed as a
      // duplicate and the deep link was lost on home (XERK-249).

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

      // Nothing may navigate before the app has booted. mantle.init() — run by
      // the index route — is what registers the built-in miniapp catalog, so a
      // handler that lands on /home first produces a home screen with no
      // Settings tile, no Glasses Mirror and no bottom bar, unrecoverable
      // without a force-stop. This guard sits here rather than in individual
      // handlers because every entry point needs it: cold deep links, the
      // +not-found fallback, and any handler that ends up at home (XERK-249).
      if (!mantle.isInitialized) {
        // Idempotent: a cold start can deliver the same URL through two paths
        // (+not-found and Linking.getInitialURL). Replacing to "/" twice
        // remounts the index route, and the second instance's
        // navigateToDestination() runs clearHistoryAndGoHome *after* the first
        // has already replayed the deep link — wiping the screen the user
        // asked for. Defer once and let the boot in flight finish.
        //
        // The signal has to be our OWN record, not nav.getPendingRoute(): the
        // `initial` branch above sets that same pending route a few lines
        // earlier, so reading it made this guard see its own write, skip the
        // replace("/") below, and never boot the app at all. Paths that
        // expo-router resolves to a real file route have no other entry point,
        // so they hung on a dead screen with no way out but a force-stop.
        if (bootDeferredFor.current === url) {
          console.log("DEEPLINK: boot already pending for", url)
          return
        }
        console.log("DEEPLINK: app not initialized yet — booting through / and replaying", url)
        bootDeferredFor.current = url
        nav.setPendingRoute(url)
        nav.replace("/")
        // Nothing was navigated, so this URL has NOT been handled. Clear the
        // dedup record or index.tsx's replay after boot is mistaken for a
        // duplicate and the deep link is silently dropped on home.
        lastProcessed.current = {url: null, at: 0}
        return
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
        // Claim it now that a route matched and the handler is about to run:
        // this is the point at which a second delivery really would be a
        // duplicate.
        lastProcessed.current = {url, at: Date.now()}
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

  const contextValue: DeeplinkContextType = {
    processUrl,
  }

  return <DeeplinkContext.Provider value={contextValue}>{children}</DeeplinkContext.Provider>
}
