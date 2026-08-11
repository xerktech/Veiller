import {useLocalSearchParams} from "expo-router"
import {useEffect} from "react"
import {ActivityIndicator, View} from "react-native"

import {Screen} from "@/components/ignite"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useNavigationStore} from "@/stores/navigation"

/**
 * Deep-link landing route for `veiller://package/<id>` and the verified App
 * Link `https://apps.mentraglass.com/package/<id>`.
 *
 * expo-router owns this path, so it mounts this screen directly and the
 * deep-link table never gets to translate it. It used to render an empty
 * `<Screen>` and simply stay there under whatever the handler pushed on top —
 * one Back press landed the user on a fully blank screen (XERK-249).
 *
 * It now performs the translation itself, with `replace` so it leaves no entry
 * in the back stack.
 */
export default function PackageDeepLinkScreen() {
  const {theme} = useAppTheme()
  const {packageName} = useLocalSearchParams<{packageName?: string}>()

  useEffect(() => {
    const {replace, clearHistoryAndGoHome} = useNavigationStore.getState()
    if (typeof packageName === "string" && packageName.length > 0) {
      replace(`/applet/settings?packageName=${encodeURIComponent(packageName)}`)
      return
    }
    // No package id — nothing to show.
    console.warn("PACKAGE: opened without a packageName — going home")
    clearHistoryAndGoHome({transition: "none"})
  }, [packageName])

  return (
    <Screen preset="fixed">
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.colors.foreground} />
      </View>
    </Screen>
  )
}
