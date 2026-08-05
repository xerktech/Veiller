import {getModelCapabilities} from "@/../../cloud/packages/types/src"
import {useState} from "react"
import {Alert, ScrollView, View} from "react-native"

import {Header, Screen} from "@/components/ignite"
import HeadUpAngleComponent from "@/components/settings/HeadUpAngleComponent"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {RouteButton} from "@/components/ui/RouteButton"
import {useEngineSnapshot} from "@/hooks/useEngineSnapshot"
import {useNavigationStore} from "@/stores/navigation"
import {translate} from "@/i18n/translate"
import mantle from "@/services/MantleManager"
import {
  GLASSES_DASHBOARD_WIDGETS,
  GLASSES_DASHBOARD_WIDGET_LABEL_KEYS,
  normalizeDashboardWidgets,
  toggleDashboardWidget,
  type GlassesDashboardWidget,
} from "@/utils/glassesDashboardWidgets"
import {PermissionFeatures, checkFeaturePermissions, requestFeaturePermissions} from "@/utils/PermissionsUtils"
import {SETTINGS, useSetting} from "@mentra/engine"
import {engine} from "@mentra/engine"

export default function DashboardSettingsScreen() {
  const {goBack} = useNavigationStore.getState()
  const [headUpAngleComponentVisible, setHeadUpAngleComponentVisible] = useState(false)
  const [defaultWearable] = useSetting(SETTINGS.default_wearable.key)
  const [headUpAngle, setHeadUpAngle] = useSetting(SETTINGS.head_up_angle.key)
  const [contextualDashboardEnabled, setContextualDashboardEnabled] = useSetting(SETTINGS.contextual_dashboard.key)
  const [metricSystemEnabled, setMetricSystemEnabled] = useSetting(SETTINGS.metric_system.key)
  const [twelveHourTimeEnabled, setTwelveHourTimeEnabled] = useSetting(SETTINGS.twelve_hour_time.key)
  const [dashboardWidgets, setDashboardWidgets] = useSetting(SETTINGS.dashboard_widgets.key)
  const [headUpEnabled, setHeadUpEnabled] = useSetting(SETTINGS.head_up_enabled.key)
  const features = getModelCapabilities(defaultWearable)
  const glassesConnected =
    useEngineSnapshot(engine.glasses.status, (onChange) => engine.glasses.onStatus(onChange)).state === "connected"

  const enabledWidgets = normalizeDashboardWidgets(dashboardWidgets)

  // -- Handlers --
  const onSaveHeadUpAngle = async (newHeadUpAngle: number) => {
    if (!glassesConnected) {
      Alert.alert("Glasses not connected", "Please connect your smart glasses first.")
      return
    }
    if (newHeadUpAngle == null) {
      return
    }

    setHeadUpAngleComponentVisible(false)
    await setHeadUpAngle(newHeadUpAngle)
  }

  const onCancelHeadUpAngle = () => {
    setHeadUpAngleComponentVisible(false)
  }

  const onToggleWidget = async (widget: GlassesDashboardWidget) => {
    const next = toggleDashboardWidget(dashboardWidgets, widget)
    await setDashboardWidgets(next)

    // The calendar widget is only useful with calendar access — prompt on
    // enable, and sync immediately once granted so the widget isn't empty
    // until the next scheduled refresh.
    if (widget === "schedule" && next.includes("schedule")) {
      const hasCalendar = await checkFeaturePermissions(PermissionFeatures.CALENDAR)
      const granted = hasCalendar || (await requestFeaturePermissions(PermissionFeatures.CALENDAR))
      if (granted) {
        void mantle.sendCalendarEvents()
      }
    }
  }

  return (
    <Screen preset="fixed">
      <Header titleTx="settings:dashboardSettings" leftIcon="chevron-left" onLeftPress={goBack} />
      <ScrollView>
        <View className="gap-6 pt-6">
          {/* Contextual dashboard is the MentraOS-rendered head-up overlay; on
              devices with a native firmware dashboard (G2) it does nothing. */}
          {!features?.hasNativeDashboard && (
            <ToggleSetting
              label={translate("settings:contextualDashboardLabel")}
              subtitle={translate("settings:contextualDashboardSubtitle")}
              value={contextualDashboardEnabled}
              onValueChange={() => setContextualDashboardEnabled(!contextualDashboardEnabled)}
            />
          )}

          {/* Firmware-dashboard widget pages (G2): enable/disable each widget. */}
          {features?.hasNativeDashboard &&
            GLASSES_DASHBOARD_WIDGETS.map((widget) => (
              <ToggleSetting
                key={widget}
                label={translate(`settings:${GLASSES_DASHBOARD_WIDGET_LABEL_KEYS[widget].label}` as any)}
                subtitle={translate(`settings:${GLASSES_DASHBOARD_WIDGET_LABEL_KEYS[widget].subtitle}` as any)}
                value={enabledWidgets.includes(widget)}
                onValueChange={() => onToggleWidget(widget)}
              />
            ))}

          <ToggleSetting
            label={translate("settings:metricSystemLabel")}
            subtitle={translate("settings:metricSystemSubtitle")}
            value={metricSystemEnabled}
            onValueChange={() => setMetricSystemEnabled(!metricSystemEnabled)}
          />

          <ToggleSetting
            label={translate("settings:twelveHourTimeLabel")}
            subtitle={translate("settings:twelveHourTimeSubtitle")}
            value={twelveHourTimeEnabled}
            onValueChange={() => setTwelveHourTimeEnabled(!twelveHourTimeEnabled)}
          />

          {defaultWearable && features?.hasIMU && (
            <ToggleSetting
              label={translate("settings:headUpEnabledLabel")}
              subtitle={translate("settings:headUpEnabledSubtitle")}
              value={headUpEnabled}
              onValueChange={() => setHeadUpEnabled(!headUpEnabled)}
            />
          )}

          {/* The angle only means anything while tilt-to-wake is on. */}
          {defaultWearable && features?.hasIMU && headUpEnabled && (
            <RouteButton
              label={translate("settings:adjustHeadAngleLabel")}
              subtitle={translate("settings:adjustHeadAngleSubtitle")}
              onPress={() => setHeadUpAngleComponentVisible(true)}
            />
          )}

          {headUpAngle !== null && (
            <HeadUpAngleComponent
              visible={headUpAngleComponentVisible}
              initialAngle={headUpAngle}
              onCancel={onCancelHeadUpAngle}
              onSave={onSaveHeadUpAngle}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}
