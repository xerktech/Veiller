import {View, ViewStyle} from "react-native"

import {Button, Text} from "@/components/ignite"
import GlassesDisplayMirror from "@/components/mirror/GlassesDisplayMirror"
import {useNavigationStore} from "@/stores/navigation"
import GlassView from "@/components/ui/GlassView"

export default function ConnectedSimulatedGlassesInfo({
  style,
  mirrorStyle,
  showHeader = true,
  showConnectButton = true,
}: {
  style?: ViewStyle
  mirrorStyle?: ViewStyle
  showHeader?: boolean
  showConnectButton?: boolean
}) {
  const {push} = useNavigationStore.getState()

  // Foverlay: fullscreen camera-background mirror removed (expo-camera dropped
  // — G2 has no camera; the fullscreen trigger below was already commented out
  // upstream).

  return (
    <GlassView className="bg-neutral-50 p-5" style={style}>
      {showHeader && (
        <View className="flex-row justify-between items-center mb-4">
          <Text className="font-semibold text-secondary-foreground text-lg" tx="onboarding:phoneMode" />
        </View>
      )}
      <GlassesDisplayMirror fallbackMessage="Glasses mirror" style={mirrorStyle} />
      {showConnectButton && (
        <Button
          className="mt-3"
          flex={false}
          flexContainer={false}
          tx="home:connectGlasses"
          preset="primary"
          onPress={() => push("/pairing/select-glasses-model")}
        />
      )}
    </GlassView>
  )
}
