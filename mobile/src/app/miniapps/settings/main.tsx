import {View} from "react-native"
import {ScrollView} from "react-native-gesture-handler"

import {VersionInfo} from "@/components/dev/VersionInfo"
import {Icon, Screen} from "@/components/ignite"
import {DeviceSettingsSection} from "@/components/settings/DeviceSettingsSection"
import {Group} from "@/components/ui/Group"
import {RouteButton} from "@/components/ui/RouteButton"
import {Spacer} from "@/components/ui/Spacer"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useEngineSnapshot} from "@/hooks/useEngineSnapshot"
import {useNavigationStore} from "@/stores/navigation"
import {translate} from "@/i18n"
import {useRef} from "react"
import {useRegisterCapsule} from "@/stores/capsule"
import {engine} from "@mentra/engine"

export default function MainSettingsPage() {
  const {theme} = useAppTheme()
  const {push} = useNavigationStore.getState()
  const viewShotRef = useRef<View>(null)
  // Tap SDK support is Android-only; on unsupported platforms the tester row is hidden.
  const tapStrapSupported = useEngineSnapshot(engine.tapStrap.status, (onChange) =>
    engine.tapStrap.onStatus(onChange),
  ).supported

  useRegisterCapsule({
    packageName: "com.mentra.settings",
    viewShotRef,
    visibleOnRoutes: ["/miniapps/settings/"],
    offsetRight: theme.spacing.s2,
  })

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} ref={viewShotRef} className="px-0">
      <ScrollView className="pt-8 px-6" contentInsetAdjustmentBehavior="automatic">
        <View style={{flex: 1, gap: theme.spacing.s6}}>
          {/* Device/glasses settings, flattened inline (previously a separate page) */}
          <DeviceSettingsSection />

          {/* Tap Strap tester (previously a dedicated miniapp, XERK-213) */}
          {tapStrapSupported && (
            <Group title={translate("home:tapStraps")}>
              <RouteButton
                icon={<Icon name="hand-click" size={24} color={theme.colors.secondary_foreground} />}
                label={translate("tapTester:title")}
                onPress={() => push("/miniapps/settings/taptester")}
              />
            </Group>
          )}

          <Group title={translate("account:appSettings")}>
            <RouteButton
              icon={<Icon name="message-2-star" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:feedback")}
              onPress={() =>
                push("/miniapps/settings/feedback", {
                  triggerSource: "settings",
                  sourceRoute: "/miniapps/settings/",
                })
              }
            />
            <RouteButton
              icon={<Icon name="sun" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:appAppearance")}
              onPress={() => push("/miniapps/settings/appearance")}
            />
            <RouteButton
              icon={<Icon name="bell" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:notificationsSettings")}
              onPress={() => push("/miniapps/settings/notifications")}
            />
            {/* Microphone lives in the device section above (it's a glasses mic selector) */}
            <RouteButton
              icon={<Icon name="volume" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:speechSettings")}
              onPress={() => push("/miniapps/settings/speech")}
            />
            <RouteButton
              icon={<Icon name="shield-lock" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:privacySettings")}
              onPress={() => push("/miniapps/settings/privacy")}
            />
          </Group>

          <Group title={translate("deviceSettings:advancedSettings")}>
            <RouteButton
              icon={<Icon name="user-code" size={24} color={theme.colors.secondary_foreground} />}
              label={translate("settings:debugSettings")}
              onPress={() => push("/miniapps/settings/debug")}
              onLongPress={() => push("/miniapps/settings/super")}
            />
          </Group>
        </View>

        <VersionInfo />
        <Spacer height={theme.spacing.s10} />
      </ScrollView>
    </Screen>
  )
}
