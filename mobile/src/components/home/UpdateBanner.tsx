import {useCallback, useEffect, useSyncExternalStore} from "react"
import {AppState, Platform, View} from "react-native"
import Animated, {SlideInUp, SlideOutUp} from "react-native-reanimated"
import {useFocusEffect} from "@react-navigation/native"

import {Button, Icon, Text} from "@/components/ignite"
import GlassView from "@/components/ui/GlassView"
import {useAppTheme} from "@/contexts/ThemeContext"
import {translate} from "@/i18n"
import {appUpdater, type UpdateState} from "@/services/update/appUpdater"

/**
 * The in-app update banner (XERK-232): a slim card that slides into the top of
 * the home screen when a newer Veiller APK is published to GitHub, with a
 * one-tap download & install. Veiller is sideloaded, so this is the only way a
 * published release reaches a phone.
 *
 * Renders nothing at all when there's nothing to offer — the common case costs
 * no vertical space — and nothing ever on iOS, which updates through
 * TestFlight/the App Store.
 */
export function UpdateBanner() {
  const state = useSyncExternalStore(appUpdater.subscribe, appUpdater.getState, appUpdater.getState)

  // Re-check whenever the home screen comes into view, and whenever the app is
  // brought back to the foreground (a long-lived process would otherwise only
  // notice a release on a cold start). Both are throttled inside the updater.
  useFocusEffect(
    useCallback(() => {
      appUpdater.check()
    }, []),
  )

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") appUpdater.check()
    })
    return () => subscription.remove()
  }, [])

  if (Platform.OS !== "android" || state.kind === "hidden") return null

  return (
    <Animated.View entering={SlideInUp} exiting={SlideOutUp} className="mb-2">
      <BannerCard state={state} />
    </Animated.View>
  )
}

function BannerCard({state}: {state: Exclude<UpdateState, {kind: "hidden"}>}) {
  const {theme} = useAppTheme()
  const subtitle = subtitleFor(state)

  return (
    <GlassView className="p-4 bg-primary-foreground">
      <View className="flex-row items-center gap-3">
        <Icon icon="world-download" size={22} color={theme.colors.secondary_foreground} />
        <View className="flex-1">
          <Text text={titleFor(state)} className="text-base font-semibold text-secondary-foreground" />
          {subtitle ? <Text text={subtitle} className="text-xs text-muted-foreground mt-0.5" /> : null}
        </View>
      </View>

      {state.kind === "downloading" ? (
        <ProgressBar pct={state.pct} />
      ) : (
        <View className="flex-row gap-3 mt-4">
          {/* No "Later" once the APK is downloaded — the work is already done;
              the only sensible action left is to finish installing it. */}
          {state.kind === "available" ? (
            <Button
              flex
              className="w-1/2"
              tx="appUpdate:later"
              preset="secondary"
              style={{backgroundColor: theme.colors.background}}
              onPress={appUpdater.dismiss}
            />
          ) : null}
          <Button
            flex
            className={state.kind === "available" ? "w-1/2" : undefined}
            text={actionLabelFor(state)}
            preset="primary"
            onPress={appUpdater.act}
          />
        </View>
      )}
    </GlassView>
  )
}

/** Determinate once GitHub reports a content length; a thin idle track until then. */
function ProgressBar({pct}: {pct: number | null}) {
  return (
    <View className="mt-4">
      <View className="h-1.5 w-full rounded-full bg-border overflow-hidden">
        <View className="h-full rounded-full bg-secondary-foreground" style={{width: `${pct ?? 0}%`}} />
      </View>
      {pct !== null ? <Text text={`${pct}%`} className="text-xs text-muted-foreground mt-1" /> : null}
    </View>
  )
}

function titleFor(state: Exclude<UpdateState, {kind: "hidden"}>): string {
  switch (state.kind) {
    case "available":
      return translate("appUpdate:updateAvailable", {version: state.version})
    case "downloading":
      return translate("appUpdate:downloading", {version: state.version})
    case "readyToInstall":
      return translate("appUpdate:readyToInstall", {version: state.version})
    case "failed":
      return translate("appUpdate:updateFailed")
  }
}

function subtitleFor(state: Exclude<UpdateState, {kind: "hidden"}>): string | null {
  switch (state.kind) {
    case "available":
      return translate("appUpdate:updateAvailableDescription")
    case "readyToInstall":
      return translate("appUpdate:readyToInstallDescription")
    case "failed":
      return state.message
    default:
      return null
  }
}

function actionLabelFor(state: Exclude<UpdateState, {kind: "hidden"}>): string {
  switch (state.kind) {
    case "available":
      return translate("appUpdate:update")
    case "readyToInstall":
      return translate("appUpdate:install")
    case "failed":
      return translate("appUpdate:retry")
    default:
      return ""
  }
}
