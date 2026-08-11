import {useGlobalSearchParams, usePathname} from "expo-router"
import {useEffect, useRef} from "react"
import {ActivityIndicator, View} from "react-native"

import {Screen} from "@/components/ignite"
import {useDeeplink} from "@/contexts/DeeplinkContext"
import {useAppTheme} from "@/contexts/ThemeContext"

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
export default function NotFoundScreen() {
  const {theme} = useAppTheme()
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const {processUrl} = useDeeplink()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const query = Object.entries(params)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&")
    const path = query ? `${pathname}?${query}` : pathname

    console.warn("NOT_FOUND: no file route for", path, "— handing back to the deep-link processor")

    // Hand straight to the processor: it boots the app first when needed, and
    // its fallback handler routes an unrecognised path through the index route.
    // Going home here first was wrong — before boot that renders the home
    // screen without its built-in miniapps (no Settings, no Glasses Mirror).
    void processUrl(`com.xerktech.veiller://${path.replace(/^\/+/, "")}`)
  }, [pathname, params, processUrl])

  return (
    <Screen preset="fixed">
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.colors.foreground} />
      </View>
    </Screen>
  )
}
