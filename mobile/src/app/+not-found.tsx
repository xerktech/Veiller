import {useGlobalSearchParams, usePathname} from "expo-router"
import {useEffect, useRef} from "react"
import {ActivityIndicator, View} from "react-native"

import {Screen} from "@/components/ignite"
import {useDeeplink} from "@/contexts/DeeplinkContext"
import mantle from "@/services/MantleManager"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useNavigationStore} from "@/stores/navigation"

/**
 * Catch-all for paths expo-router cannot resolve to a file route.
 *
 * The app's deep links are *virtual*: `DeeplinkContext` matches patterns like
 * `/settings`, `/glasses` and `/package/:packageName` and translates them into
 * real routes. But expo-router resolves an incoming URL against the file tree
 * first, so on a **cold start** those paths hit no route and rendered the
 * development "Unmatched Route / Page could not be found" screen — a dead end
 * with a Sitemap link, shipped to users (XERK-249).
 *
 * Rather than show that, hand the path back to the deep-link processor, which
 * knows how to translate it, and fall back to home when it cannot. A spinner
 * covers the handoff so the screen never reads as an error.
 */
/**
 * How long to let the deep-link handoff navigate before bailing out to home.
 * Generous: a cold start boots the runtime first, which takes a while.
 */
const NOT_FOUND_RESCUE_MS = 15_000

export default function NotFoundScreen() {
  const {theme} = useAppTheme()
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const {processUrl} = useDeeplink()
  const handled = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // `params` is a fresh object and `processUrl` a fresh function on every
  // render, so depending on them re-ran this effect, whose cleanup cancelled
  // the rescue timer while `handled.current` stopped it being re-armed — the
  // timer therefore never fired. Serialise the params into the dep instead and
  // hold processUrl in a ref.
  const query = Object.entries(params)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&")

  const processUrlRef = useRef(processUrl)
  processUrlRef.current = processUrl

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const path = query ? `${pathname}?${query}` : pathname

    console.warn("NOT_FOUND: no file route for", path, "— handing back to the deep-link processor")

    // Once the app has booted, drop this screen from the stack first so the
    // deep link's push lands on top of home. Otherwise Back returns here — to
    // a bare spinner whose effect has already run, which reads as a hang.
    // Before boot we must NOT do this: home without its built-in miniapps is
    // the crippled state the processUrl guard exists to prevent, and going
    // through the index route is what boots the app.
    if (mantle.isInitialized) {
      useNavigationStore.getState().clearHistoryAndGoHome({transition: "none"})
    }

    void processUrlRef.current(`com.xerktech.veiller://${path.replace(/^\/+/, "")}`)

    // Safety net: this screen must never be somewhere a user can be stranded.
    // If nothing has navigated away by the time boot and the deep-link path
    // have had their chance, fall back to home.
    const rescue = setTimeout(() => {
      if (!mountedRef.current) return
      console.warn("NOT_FOUND: nothing navigated away — falling back to home")
      useNavigationStore.getState().clearHistoryAndGoHome({transition: "none"})
    }, NOT_FOUND_RESCUE_MS)

    return () => clearTimeout(rescue)
  }, [pathname, query])

  return (
    <Screen preset="fixed">
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.colors.foreground} />
      </View>
    </Screen>
  )
}
