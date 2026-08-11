import {useFocusEffect, useGlobalSearchParams, usePathname} from "expo-router"
import {useCallback, useEffect, useRef} from "react"
import {ActivityIndicator, View} from "react-native"

import {Screen} from "@/components/ignite"
import {useDeeplink} from "@/contexts/DeeplinkContext"
import mantle from "@/services/MantleManager"
import {useAppTheme} from "@/contexts/ThemeContext"
import {decideNotFoundAction, mayRescueToHome} from "@/services/deeplink/planDeeplink"
import {useNavigationStore} from "@/stores/navigation"

/**
 * Catch-all for paths expo-router cannot resolve to a file route.
 *
 * The app's deep links are *virtual*: `DeeplinkContext` matches patterns like
 * `/settings`, `/glasses` and `/pairing/bluetooth` and translates them into real
 * routes. expo-router resolves an incoming URL against the file tree first, so
 * on a cold start those paths hit no route and would otherwise render the
 * development "Unmatched Route / Page could not be found" screen — a dead end,
 * shipped to users (XERK-249).
 *
 * This screen is only a shim, and both of its hazards are about *when* it
 * navigates:
 *
 *  - Resetting to home before handing off strands the user whenever the handoff
 *    then declines to navigate (a repeat delivery), and before boot it produces
 *    the crippled home — no Settings tile, no Glasses Mirror, no bottom bar —
 *    that the boot deferral exists to avoid. So it resets only when the plan
 *    says something will definitely navigate.
 *  - Left in the back stack it is a bare spinner. Rather than manipulate
 *    history, it sends the user home if they ever navigate *back* into it.
 */

/**
 * How long to let the deep-link handoff navigate before bailing out to home.
 * Generous: a cold start boots the runtime first, which takes a while.
 */
const NOT_FOUND_RESCUE_MS = 20_000

export default function NotFoundScreen() {
  const {theme} = useAppTheme()
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const {processUrl, planFor} = useDeeplink()

  const handled = useRef(false)
  const mountedRef = useRef(true)
  const hasBlurred = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // `params` is a fresh object and the context functions fresh closures on
  // every render, so depending on them re-ran the handoff effect, whose cleanup
  // cancelled the rescue timer while `handled` stopped it being re-armed — the
  // timer therefore never fired at all. Depend on a serialised string instead,
  // and hold the context functions in refs.
  const query = Object.entries(params)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&")

  const processUrlRef = useRef(processUrl)
  processUrlRef.current = processUrl
  const planForRef = useRef(planFor)
  planForRef.current = planFor

  // If this screen is focused *again* — the user pressed Back into it — it has
  // already done its job and is nothing but a spinner. Leave.
  useFocusEffect(
    useCallback(() => {
      if (hasBlurred.current && handled.current) {
        useNavigationStore.getState().clearHistoryAndGoHome({transition: "none"})
      }
      return () => {
        hasBlurred.current = true
      }
    }, []),
  )

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const path = query ? `${pathname}?${query}` : pathname
    const url = `com.xerktech.veiller://${path.replace(/^\/+/, "")}`

    const plan = planForRef.current(url)
    const action = decideNotFoundAction(plan)
    console.warn("NOT_FOUND: no file route for", path, "— plan:", plan.kind, "action:", action.kind)

    if (action.kind === "pop") {
      useNavigationStore.getState().goBack()
      return
    }
    if (action.kind === "reset-then-handoff") {
      useNavigationStore.getState().clearHistoryAndGoHome({transition: "none"})
    }

    void processUrlRef.current(url)

    // Safety net: never leave the user staring at a spinner. Only meaningful
    // once the app has booted — before that a boot is in flight, and going home
    // would produce the crippled home this path exists to avoid.
    const rescue = setTimeout(() => {
      if (!mayRescueToHome({isMounted: mountedRef.current, isInitialized: mantle.isInitialized})) return
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
