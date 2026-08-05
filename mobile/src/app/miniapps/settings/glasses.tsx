import {ScrollView, View} from "react-native"

import {Header, Screen} from "@/components/ignite"
import GroupTitle from "@/components/settings/GroupTitle"
import ToggleSetting from "@/components/settings/ToggleSetting"
import {useNavigationStore} from "@/stores/navigation"
import {translate} from "@/i18n/translate"
import {SETTINGS, useSetting} from "@mentra/engine"

/**
 * Device-behavior controls for the Even Realities G2 firmware that aren't part
 * of the dashboard/HUD: the "Hey Even" wake word, wear detection, and silent
 * mode. Each maps to a documented G2 setting command and is applied on change
 * and re-applied on connect by the G2 driver.
 */
export default function GlassesControlsScreen() {
  const {goBack} = useNavigationStore.getState()
  const [heyEvenEnabled, setHeyEvenEnabled] = useSetting(SETTINGS.hey_even_enabled.key)
  const [wearDetectionEnabled, setWearDetectionEnabled] = useSetting(SETTINGS.wear_detection_enabled.key)
  const [silentModeEnabled, setSilentModeEnabled] = useSetting(SETTINGS.silent_mode_enabled.key)

  return (
    <Screen preset="fixed">
      <Header titleTx="settings:glassesControls" leftIcon="chevron-left" onLeftPress={goBack} />
      <ScrollView>
        <View className="gap-3 pt-2">
          <GroupTitle title={translate("settings:glassesControlsVoiceGroup")} />
          <ToggleSetting
            label={translate("settings:heyEvenLabel")}
            subtitle={translate("settings:heyEvenSubtitle")}
            value={heyEvenEnabled}
            onValueChange={() => setHeyEvenEnabled(!heyEvenEnabled)}
          />

          <GroupTitle title={translate("settings:glassesControlsDeviceGroup")} />
          <ToggleSetting
            label={translate("settings:wearDetectionLabel")}
            subtitle={translate("settings:wearDetectionSubtitle")}
            value={wearDetectionEnabled}
            onValueChange={() => setWearDetectionEnabled(!wearDetectionEnabled)}
          />
          <ToggleSetting
            label={translate("settings:silentModeLabel")}
            subtitle={translate("settings:silentModeSubtitle")}
            value={silentModeEnabled}
            onValueChange={() => setSilentModeEnabled(!silentModeEnabled)}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}
