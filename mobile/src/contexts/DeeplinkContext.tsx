import * as Linking from "expo-linking"
import {FC, ReactNode, createContext, useContext, useEffect} from "react"

import {useSplashLoader} from "@/contexts/SplashLoaderProvider"
import {BgTimer} from "@mentra/engine"
import {useNavigationStore} from "@/stores/navigation"

export interface DeepLinkRoute {
  pattern: string
  handler: (url: string, params: Record<string, string>) => void | Promise<void>
}

/**
 * Define all deep link routes for the app.
 *
 * Foverlay has no user account / login (XERK-198), so no route requires auth
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
      nav.replaceAll("/home")
    },
  },

  // Settings routes
  {
    pattern: "/settings",
    handler: (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      nav.push("/miniapps/settings")
    },
  },
  {
    pattern: "/miniapps/settings/:section",
    handler: (url: string, params: Record<string, string>) => {
      const {section} = params
      const nav = useNavigationStore.getState()
      // Map section names to actual routes
      const sectionRoutes: Record<string, string> = {
        "privacy": "/miniapps/settings/privacy",
        "developer": "/miniapps/settings/developer",
        "theme": "/miniapps/settings/theme",
        "dashboard": "/miniapps/settings/dashboard",
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
      nav.push("/glasses")
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
      nav.push("/pairing/guide")
    },
  },
  {
    pattern: "/pairing/:step",
    handler: (url: string, params: Record<string, string>) => {
      const {step} = params
      const nav = useNavigationStore.getState()

      const pairingRoutes: Record<string, string> = {
        "guide": "/pairing/guide",
        "prep": "/pairing/prep",
        "bluetooth": "/pairing/bluetooth",
        "select-glasses": "/pairing/select-glasses-model",
        "wifi-setup": "/wifi/scan",
      }

      const route = pairingRoutes[step]
      if (route) {
        nav.push(route as any)
      } else {
        nav.push("/pairing/guide")
      }
    },
  },

  // Mirror/Gallery routes
  {
    pattern: "/mirror/gallery",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      nav.push("/mirror/gallery")
    },
  },
  {
    pattern: "/mirror/video/:videoId",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      const {videoId} = params
      nav.push(`/mirror/video-player?videoId=${videoId}`)
    },
  },

  // Search routes
  {
    pattern: "/search",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      const {q} = params
      const route = q ? `/search/search?q=${encodeURIComponent(q)}` : "/search/search"
      nav.push(route as any)
    },
  },

  // Onboarding routes
  {
    pattern: "/welcome",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      nav.push("/welcome")
    },
  },
  {
    pattern: "/onboarding/welcome",
    handler: async (url: string, params: Record<string, string>) => {
      const nav = useNavigationStore.getState()
      nav.push("/onboarding/welcome")
    },
  },

  // Universal app link routes (for apps.mentra.glass). The /applet/webview
  // target for Cloud V1 apps is gone (Cloud V1 app end-of-life); app links
  // land on the installed app's info screen instead.
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
    scheme: "com.xerktech.foverlay",
    host: "apps.mentra.glass",
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
  const findMatchingRoute = (url: URL): DeepLinkRoute | null => {
    const host = url.host
    let pathname = url.pathname
    const isAppScheme = url.protocol === `${config.scheme}:`
    if (isAppScheme && host) {
      pathname = `/${host}${pathname}`
    }

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

    // Extract path parameters
    const pathParts = url.pathname.split("/").filter(Boolean)
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

  let lastProcessedUrl: string | null = null
  let lastProcessedTime = 0

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
      if (!initial && url === lastProcessedUrl && now - lastProcessedTime < 3000) {
        console.log("DEEPLINK: Ignoring duplicate URL")
        return
      }
      lastProcessedUrl = url
      lastProcessedTime = now

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
        url = "https://apps.mentra.glass" + url
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
