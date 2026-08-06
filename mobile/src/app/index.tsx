import {useRootNavigationState} from "expo-router"
import {useState, useEffect, useRef, useCallback} from "react"
import {View, ActivityIndicator, Platform, Linking} from "react-native"
import semver from "semver"

import {Button, Header, Icon, Screen, Text} from "@/components/ignite"
import {VeillerLogo} from "@/components/brands/VeillerLogo"
import {useDeeplink} from "@/contexts/DeeplinkContext"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useNavigationStore} from "@/stores/navigation"
import {translate} from "@/i18n"
import mantle from "@/services/MantleManager"
import {SETTINGS, engine, useSetting, BgTimer} from "@mentra/engine"
import {SplashVideo} from "@/components/splash/SplashVideo"
import {APP_STORE_URL, PLAY_STORE_URL} from "@/constants/appConfig"
import {fetchMinimumClientVersion} from "@/utils/cloudVersion"

// Types
type ScreenState = "loading" | "connection" | "outdated" | "success"

interface StatusConfig {
  icon: string
  iconColor: string
  title: string
  description: string
}

// Constants
const NAVIGATION_DELAY = 300
const DEEPLINK_DELAY = 1000

export default function InitScreen() {
  // Hooks
  const {theme} = useAppTheme()
  const {replace, getPendingRoute, setPendingRoute, clearHistoryAndGoHome, setAnimation} = useNavigationStore.getState()
  const {processUrl} = useDeeplink()
  const rootNavigationState = useRootNavigationState()
  const isNavigationReady = rootNavigationState?.key != null

  // State
  const initStartedRef = useRef(false)
  const [state, setState] = useState<ScreenState>("loading")
  const [_localVersion, setLocalVersion] = useState<string | null>(null)
  const [_cloudVersion, setCloudVersion] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isUsingCustomUrl, setIsUsingCustomUrl] = useState(false)
  const [canSkipUpdate, setCanSkipUpdate] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isBlockedByVersion, setIsBlockedByVersion] = useState(false)
  // Zustand store hooks
  // The boot version gate hits cloud_core_url (resolvedEndpoints().core), so the
  // custom-URL detection + reset recovery operate on that setting, not the
  // retired V1 backend_url.
  const [coreUrl, setCoreUrl] = useSetting(SETTINGS.cloud_core_url.key)
  const [_onboardingCompleted, _setOnboardingCompleted] = useSetting(SETTINGS.onboarding_completed.key)
  const [_defaultWearable, _setDefaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const [appBootExtraInfo] = useSetting(SETTINGS.app_boot_extra_info.key)
  const [bootPhase, setBootPhase] = useState<string>("Starting up…")
  const [cachedRequiredVersion, setCachedRequiredVersion] = useSetting(SETTINGS.cached_required_version.key)

  // Helper Functions
  const getLocalVersion = (): string | null => {
    try {
      return process.env.EXPO_PUBLIC_MENTRAOS_VERSION || null
    } catch (error) {
      console.error("Error getting local version:", error)
      return null
    }
  }

  const checkCustomUrl = async (): Promise<boolean> => {
    const defaultUrl = SETTINGS[SETTINGS.cloud_core_url.key].defaultValue()
    // Read directly from the store to avoid stale React closure values
    const currentUrl = engine.settings.get(SETTINGS.cloud_core_url.key)
    const isCustom = currentUrl !== defaultUrl
    setIsUsingCustomUrl(isCustom)
    return isCustom
  }

  const setAnimationDelayed = () => {
    BgTimer.setTimeout(() => {
      setAnimation("simple_push")
    }, 800)
  }

  useEffect(() => {
    console.log("INDEX: MOUNTED")
    return () => console.log("INDEX: UNMOUNTED")
  }, [])

  const navigateToDestination = useCallback(async () => {
    console.log("INDEX: navigateToDestination()")
    // Read directly from the store so we see values that mantle.init() just
    // loaded, regardless of React render timing.
    const onboardingDone = engine.settings.get(SETTINGS.onboarding_completed.key)
    const wearable = engine.settings.get(SETTINGS.default_wearable.key)

    if (!onboardingDone && !wearable) {
      await new Promise((resolve) => setTimeout(resolve, NAVIGATION_DELAY))
      replace("/onboarding/welcome", {transition: "fade"})
      return
    }

    const pendingRoute = getPendingRoute()
    if (pendingRoute) {
      setPendingRoute(null)
      // Navigate to home first so the deep link screen has a proper back destination
      clearHistoryAndGoHome({transition: "none"})
      setTimeout(() => processUrl(pendingRoute), DEEPLINK_DELAY)
      return
    }

    await new Promise((resolve) => setTimeout(resolve, NAVIGATION_DELAY))
    setAnimationDelayed()
    clearHistoryAndGoHome({transition: "none"})
  }, [getPendingRoute, processUrl, clearHistoryAndGoHome, replace, setPendingRoute, setAnimation])

  // Veiller: no user account / login. Boot straight into the app — initialize
  // the local runtime, then route to onboarding (first run) or home. The engine
  // runs local-only (no authenticated cloud connection); individual miniapps
  // bring their own auth if they need it.
  const bootIntoApp = async (): Promise<void> => {
    console.log("INDEX: bootIntoApp()")
    setBootPhase("Initializing core…")
    await mantle.init()

    setBootPhase("Navigating…")
    await navigateToDestination()
  }

  const checkCloudVersion = async (isRetry = false): Promise<void> => {
    // Only show loading screen on initial load, not on retry
    if (!isRetry) {
      setState("loading")
    } else {
      setIsRetrying(true)
    }
    setBootPhase("Checking for updates…")

    const localVer = getLocalVersion()
    console.log("INDEX: Local version:", localVer)

    if (!localVer) {
      console.error("Failed to get local version")
      setState("connection")
      setIsRetrying(false)
      return
    }

    // Cloud V2 core serves the version gate (V1's copy is retired with
    // RestComms). Retries cover the boot-time DNS blips that historically
    // dumped users at the connection-error screen (which blocks login).
    const res = await fetchMinimumClientVersion(3, 1000)
    if (res.is_error()) {
      console.error("Failed to fetch cloud version:", res.error)

      // Even offline, check cached required version to block outdated apps
      if (cachedRequiredVersion && semver.lt(localVer, cachedRequiredVersion)) {
        console.log(`INDEX: Offline but app is below cached required version (${localVer} < ${cachedRequiredVersion})`)
        setLocalVersion(localVer)
        setCloudVersion(cachedRequiredVersion)
        setCanSkipUpdate(false)
        setIsBlockedByVersion(true)
        setState("outdated")
        setIsRetrying(false)
        return
      }

      setState("connection")
      setIsRetrying(false)
      return
    }

    const {required, recommended} = res.value
    console.log(`INDEX: Version check: local=${localVer}, required=${required}, recommended=${recommended}`)

    // Cache the required version for offline enforcement
    if (required && required !== cachedRequiredVersion) {
      setCachedRequiredVersion(required)
    }

    if (semver.lt(localVer, recommended)) {
      setLocalVersion(localVer)
      setCloudVersion(recommended)
      setCanSkipUpdate(!semver.lt(localVer, required))
      setIsBlockedByVersion(semver.lt(localVer, required))
      setState("outdated")
      setIsRetrying(false)
      return
    }

    setIsRetrying(false)
    bootIntoApp()
  }

  const handleUpdate = async (): Promise<void> => {
    setIsUpdating(true)
    try {
      const url = Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL
      await Linking.openURL(url)
    } catch (error) {
      console.error("Error opening store:", error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleResetUrl = async (): Promise<void> => {
    try {
      const defaultUrl = SETTINGS[SETTINGS.cloud_core_url.key].defaultValue()
      await setCoreUrl(defaultUrl)
      setIsUsingCustomUrl(false)
      await checkCloudVersion(true) // Pass true for retry to avoid flash
    } catch (error) {
      console.error("Failed to reset URL:", error)
    }
  }

  const getStatusConfig = (): StatusConfig => {
    switch (state) {
      case "connection":
        return {
          icon: "wifi-off",
          iconColor: theme.colors.destructive,
          title: translate("versionCheck:connectionErrorTitle"),
          description: isUsingCustomUrl
            ? translate("versionCheck:connectionErrorCustomUrl")
            : translate("versionCheck:connectionErrorDescription"),
        }

      case "outdated":
        return {
          icon: "update",
          iconColor: theme.colors.destructive,
          title: translate(canSkipUpdate ? "versionCheck:updateAvailableTitle" : "versionCheck:updateRequiredTitle"),
          description: translate(
            canSkipUpdate ? "versionCheck:updateAvailableDescription" : "versionCheck:updateRequiredDescription",
          ),
        }

      default:
        return {
          icon: "check-circle",
          iconColor: theme.colors.primary,
          title: translate("versionCheck:upToDateTitle"),
          description: translate("versionCheck:upToDateDescription"),
        }
    }
  }

  // Effects
  useEffect(() => {
    console.log("INDEX: USE EFFECT: isNavigationReady:", isNavigationReady)
    if (!isNavigationReady) return
    if (initStartedRef.current) return
    initStartedRef.current = true

    const init = async () => {
      console.log("INDEX: init()")
      await checkCustomUrl()
      await checkCloudVersion()
    }
    init()
  }, [isNavigationReady])

  // Clear cached required version when backend URL changes so a stricter
  // server's requirement doesn't block access to a different backend.
  // Skip the initial mount so the cached value is preserved for offline enforcement.
  const coreUrlRef = useRef(coreUrl)
  useEffect(() => {
    if (coreUrlRef.current !== coreUrl) {
      coreUrlRef.current = coreUrl
      if (cachedRequiredVersion) {
        setCachedRequiredVersion("")
      }
    }
  }, [coreUrl])

  useEffect(() => {
    setAnimation("fade")
  }, [])

  // Render
  if (state === "loading") {
    return (
      <Screen preset="fixed">
        <SplashVideo label={appBootExtraInfo ? bootPhase : undefined} />
      </Screen>
    )
  }

  const statusConfig = getStatusConfig()

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} extraAndroidInsets>
      <Header RightActionComponent={<VeillerLogo />} />

      {/* Content */}
      <View className="flex-1 items-center justify-center px-6">
        {state === "outdated" ? (
          <VeillerLogo width={100} height={48} />
        ) : (
          <Icon name={statusConfig.icon as any} size={64} color={statusConfig.iconColor} />
        )}
        <View className="h-6" />
        <Text text={statusConfig.title} className="font-semibold text-xl text-center" />
        <View className="h-2" />
        <Text text={statusConfig.description} className="text-sm text-center" style={{color: theme.colors.textDim}} />
      </View>

      {/* Buttons */}
      <View className="gap-3">
        {state === "connection" && (
          <Button
            flexContainer
            onPress={() => checkCloudVersion(true)}
            text={isRetrying ? translate("versionCheck:retrying") : translate("versionCheck:retryConnection")}
            disabled={isRetrying}
            LeftAccessory={
              isRetrying ? () => <ActivityIndicator size="small" color={theme.colors.foreground} /> : undefined
            }
          />
        )}

        {state === "outdated" && (
          <Button
            flexContainer
            preset="primary"
            onPress={handleUpdate}
            disabled={isUpdating}
            tx={canSkipUpdate ? "versionCheck:update" : "versionCheck:updateRequiredButton"}
          />
        )}

        {state === "connection" && isUsingCustomUrl && (
          <Button
            flexContainer
            onPress={handleResetUrl}
            tx={isRetrying ? "versionCheck:resetting" : "versionCheck:resetUrl"}
            preset="secondary"
            disabled={isRetrying}
            LeftAccessory={
              isRetrying ? () => <ActivityIndicator size="small" color={theme.colors.foreground} /> : undefined
            }
          />
        )}

        {((state === "connection" && !isBlockedByVersion) || (state === "outdated" && canSkipUpdate)) && (
          <Button flexContainer preset="secondary" onPress={navigateToDestination} tx="versionCheck:continueAnyway" />
        )}
      </View>
    </Screen>
  )
}
