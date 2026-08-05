import * as Clipboard from "expo-clipboard"
import {Linking, TextStyle, TouchableOpacity, View} from "react-native"
import Toast from "react-native-toast-message"

import {Text} from "@/components/ignite"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useEngineSnapshot} from "@/hooks/useEngineSnapshot"
import {translate} from "@/i18n"
import {engine, SETTINGS, useSetting} from "@mentra/engine"
import {ThemedStyle} from "@/theme"

export const VersionInfo = () => {
  const {themed} = useAppTheme()
  const [coreUrl] = useSetting(SETTINGS.cloud_core_url.key)
  const audioTransport = useEngineSnapshot(engine.session.status, (onChange) =>
    engine.session.onStatus(onChange),
  ).audioTransport

  const isChina = process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china"

  const copyVersionInfo = async () => {
    // Foverlay has no user account (XERK-198), so there is no id/email to include.
    const info = [
      `version: ${process.env.EXPO_PUBLIC_MENTRAOS_VERSION}`,
      `branch: ${process.env.EXPO_PUBLIC_BUILD_BRANCH}`,
      `time: ${process.env.EXPO_PUBLIC_BUILD_TIME}`,
      `commit: ${process.env.EXPO_PUBLIC_BUILD_COMMIT}`,
      `cloud_core_url: ${coreUrl || "(default)"}`,
      `audio: ${audioTransport}`,
    ]

    await Clipboard.setStringAsync(info.join("\n"))
    Toast.show({
      type: "info",
      text1: translate("debug:versionInfoCopied"),
      position: "bottom",
      topOffset: 80,
      visibilityTime: 1000,
    })
  }

  return (
    <TouchableOpacity onPress={copyVersionInfo}>
      <View className="items-center bottom-2 w-full py-2 rounded-xl mt-16">
        <View className="flex-row gap-2">
          <Text
            style={themed($buildInfo)}
            text={translate("common:version", {number: process.env.EXPO_PUBLIC_MENTRAOS_VERSION})}
          />
          <Text style={themed($buildInfo)} text={`${process.env.EXPO_PUBLIC_BUILD_BRANCH}`} />
        </View>
        <View className="flex-row gap-2">
          <Text style={themed($buildInfo)} text={`${process.env.EXPO_PUBLIC_BUILD_TIME}`} />
          <Text style={themed($buildInfo)} text={`${process.env.EXPO_PUBLIC_BUILD_COMMIT}`} />
        </View>
        <View className="flex-row gap-2">
          <Text style={themed($buildInfo)} text={`${coreUrl || "(default cloud)"}`} />
        </View>
        <View className="flex-row gap-2">
          <Text style={themed($buildInfo)} text={`audio: ${audioTransport}`} />
        </View>
        {isChina && (
          <TouchableOpacity onPress={() => Linking.openURL("https://beian.miit.gov.cn/")}>
            <Text style={themed($icpLink)} text="京ICP备04000001号-2" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  )
}

const $buildInfo: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.muted_foreground,
  fontSize: 13,
})

const $icpLink: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.muted_foreground,
  fontSize: 13,
  textDecorationLine: "underline",
})
