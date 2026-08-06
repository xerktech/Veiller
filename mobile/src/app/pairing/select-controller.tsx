// XERK-206: ControllerTypes unused while the R1 controller is disabled.
import {DeviceTypes} from "@/../../cloud/packages/types/src"
import {useFocusEffect} from "expo-router"
import {useCallback} from "react"
import {View, TouchableOpacity, Platform, ScrollView, Image} from "react-native"

import {EvenRealitiesLogo} from "@/components/brands/EvenRealitiesLogo"
import {VeillerLogo} from "@/components/brands/VeillerLogo"
import {VeillerLogoStandalone} from "@/components/brands/VeillerLogoStandalone"
import {VuzixLogo} from "@/components/brands/VuzixLogo"
import {Text, Header} from "@/components/ignite"
import {Screen} from "@/components/ignite/Screen"
import {Spacer} from "@/components/ui/Spacer"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useNavigationStore} from "@/stores/navigation"
import {getGlassesImage} from "@/utils/getGlassesImage"
import GlassView from "@/components/ui/GlassView"

// import {useLocalSearchParams} from "expo-router"

export default function SelectControllerScreen() {
  const {theme} = useAppTheme()
  const {push, goBack} = useNavigationStore.getState()

  // when this screen is focused, forget any glasses that may be paired:
  useFocusEffect(
    useCallback(() => {
      // BluetoothSdk.forget()
      return () => {}
    }, []),
  )

  // Get logo component for manufacturer
  const getManufacturerLogo = (deviceModel: string) => {
    switch (deviceModel) {
      case DeviceTypes.G1:
      case DeviceTypes.G2:
        return <EvenRealitiesLogo color={theme.colors.text} />
      case DeviceTypes.LIVE:
      case DeviceTypes.NEX:
      case DeviceTypes.MACH1:
        return <VeillerLogo color={theme.colors.text} />
      case DeviceTypes.Z100:
        return <VuzixLogo color={theme.colors.text} />
      default:
        return null
    }
  }

  // Platform-specific glasses options
  // XERK-206: only the Even Realities G2 and Tap Strap 2 are supported for
  // now, so the R1 controller options are commented out — not removed — so
  // they can be restored later.
  const controllerOptions: {deviceModel: string; key: string}[] =
    Platform.OS === "ios"
      ? [
          // {deviceModel: DeviceTypes.SIMULATED, key: DeviceTypes.SIMULATED},
          //{deviceModel: "Brilliant Labs Frame", key: "frame"},
          // {deviceModel: ControllerTypes.R1, key: "evenrealities_r1"},
        ]
      : [
          // Android:
          // {deviceModel: ControllerTypes.R1, key: "evenrealities_r1"},
        ]

  const triggerGlassesPairingGuide = async (deviceModel: string) => {
    push("/pairing/prep-controller", {deviceModel: deviceModel})
  }

  return (
    <Screen preset="fixed">
      <Header
        titleTx="pairing:selectModel"
        leftIcon="chevron-left"
        onLeftPress={() => {
          goBack()
        }}
        RightActionComponent={<VeillerLogoStandalone />}
      />
      <Spacer className="h-4" />
      <ScrollView className="-mr-4 pr-4 pt-6">
        <View className="flex-col gap-4 pb-8">
          {controllerOptions.map((controller) => (
            <TouchableOpacity key={controller.key} onPress={() => triggerGlassesPairingGuide(controller.deviceModel)}>
              <GlassView className="bg-primary-foreground border border-background flex-col items-center justify-center h-[190px] rounded-2xl overflow-hidden">
                <View className="flex-col items-center justify-center gap-3 w-full">
                  <View className="items-center justify-center min-h-6">
                    {getManufacturerLogo(controller.deviceModel)}
                  </View>
                  <Image
                    source={getGlassesImage(controller.deviceModel)}
                    className="w-[180px] max-h-[80px] object-contain"
                  />
                  <Text className="text-2xl text-foreground" adjustsFontSizeToFit text={controller.deviceModel} />
                </View>
              </GlassView>
            </TouchableOpacity>
          ))}
          <Spacer height={theme.spacing.s4} />
        </View>
      </ScrollView>
    </Screen>
  )
}
