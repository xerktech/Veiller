jest.mock("@react-navigation/native", () => ({
  useRoute: jest.fn(),
}))

jest.mock("@/contexts/NavigationHistoryContext", () => ({
  focusEffectPreventBack: jest.fn(),
  usePushPrevious: jest.fn(),
}))

jest.mock("@/stores/navigation", () => ({
  useNavigationStore: {getState: jest.fn()},
}))

jest.mock("@/utils/SettingsNavigationUtils", () => ({
  SettingsNavigationUtils: {
    openBluetoothSettings: jest.fn(async () => true),
  },
}))

jest.mock("@/i18n", () => ({
  translate: jest.fn((key: string) => key),
}))

jest.mock("@/contexts/ThemeContext", () => ({
  useAppTheme: () => ({
    theme: {
      colors: {
        text: "#111",
      },
    },
  }),
}))

jest.mock("@/components/ignite", () => {
  const {Text: RNText, TouchableOpacity, View} = require("react-native")
  function MockScreen({children}: {children: ReactNode}) {
    return <View>{children}</View>
  }
  function MockButton({text, onPress}: {text?: string; onPress?: () => void}) {
    return (
      <TouchableOpacity onPress={onPress}>
        <RNText>{text}</RNText>
      </TouchableOpacity>
    )
  }
  // The screen renders a header back control — the only way off it, since the
  // hardware back button is deliberately blocked (XERK-249).
  function MockHeader({onLeftPress}: {onLeftPress?: () => void}) {
    return (
      <TouchableOpacity accessibilityLabel="header-back" onPress={onLeftPress}>
        <RNText>back</RNText>
      </TouchableOpacity>
    )
  }
  return {Screen: MockScreen, Button: MockButton, Header: MockHeader}
})

jest.mock("@/components/onboarding/OnboardingGuide", () => {
  const {View} = require("react-native")
  function MockOnboardingGuide() {
    return <View />
  }
  return {OnboardingGuide: MockOnboardingGuide}
})

import {act, fireEvent, render, waitFor} from "@testing-library/react-native"
import type {ReactNode} from "react"

import {engine} from "@veiller/engine"
import {useRoute} from "@react-navigation/native"
import BtClassicPairingScreen from "@/app/pairing/btclassic"
import {usePushPrevious} from "@/contexts/NavigationHistoryContext"
import {useNavigationStore} from "@/stores/navigation"
import {SETTINGS} from "@veiller/engine"
import {useSettingsStore} from "@veiller/engine/internal"
import {useGlassesStore} from "../../../../modules/engine/src/stores/glasses"

const device = {id: "a", model: "Mentra Live", name: "MENTRA_LIVE_BLE_001", address: "a"}

describe("btclassic pairing screen", () => {
  const replace = jest.fn()
  const goBack = jest.fn()
  const pushPrevious = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    useGlassesStore.getState().reset()
    useSettingsStore.getState().resetAllSettingsLocally()
    ;(useRoute as jest.Mock).mockReturnValue({params: {device: JSON.stringify(device)}})
    // history models the stack at rejection time — after handleSuccess()'s
    // pushPrevious() reveals the loading screen pushed under this one. Only
    // the kickoff-failure guard reads it; it suppresses the failure route
    // when loading is no longer on top (e.g. paired recovery contexts).
    ;(useNavigationStore.getState as jest.Mock).mockReturnValue({
      goBack,
      replace,
      history: ["/pairing/scan", "/pairing/loading"],
    })
    ;(usePushPrevious as jest.Mock).mockReturnValue(pushPrevious)
  })

  it("kicks off the connect and reveals loading once Bluetooth Classic links", async () => {
    render(<BtClassicPairingScreen />)

    act(() => {
      useGlassesStore.getState().setGlassesInfo({bluetoothClassicConnected: true})
    })

    await waitFor(() => {
      expect(engine.glasses.connect).toHaveBeenCalledWith(device, {saveAsDefault: false})
      expect(pushPrevious).toHaveBeenCalled()
    })

    // The resolved kickoff must not trigger the failure route.
    await act(async () => {})
    expect(replace).not.toHaveBeenCalled()
  })

  it("routes a connect kickoff rejection to the failure screen", async () => {
    ;(engine.glasses.connect as jest.Mock).mockRejectedValueOnce(new Error("bluetooth powered off"))

    render(<BtClassicPairingScreen />)

    act(() => {
      useGlassesStore.getState().setGlassesInfo({bluetoothClassicConnected: true})
    })

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/pairing/failure", {
        error: "errors:pairingCouldNotStart",
        deviceModel: "Mentra Live",
      })
    })
    expect(pushPrevious).toHaveBeenCalled()
    // Parity with loading.tsx's handlePairFailure: the failed attempt is
    // cleared before the failure screen shows.
    expect(engine.pairing.abandonAttempt).toHaveBeenCalled()
  })

  it("routes a connectDefault rejection to the failure screen while loading is on top", async () => {
    ;(useRoute as jest.Mock).mockReturnValue({params: {}})
    // A paired context carries the full promoted identity (default_wearable
    // AND device_name) — the failure copy reads the model off the identity
    // read-model (engine.pairing.identity()), not raw settings keys.
    await useSettingsStore.getState().setSetting(SETTINGS.default_wearable.key, "Mentra Live", false)
    await useSettingsStore.getState().setSetting(SETTINGS.device_name.key, "MENTRA_LIVE_BLE_001", false)
    ;(engine.glasses.connectDefault as jest.Mock).mockRejectedValueOnce(new Error("no default device"))

    render(<BtClassicPairingScreen />)

    act(() => {
      useGlassesStore.getState().setGlassesInfo({bluetoothClassicConnected: true})
    })

    await waitFor(() => {
      expect(engine.glasses.connectDefault).toHaveBeenCalled()
      expect(replace).toHaveBeenCalledWith("/pairing/failure", {
        error: "errors:pairingCouldNotStart",
        deviceModel: "Mentra Live",
      })
    })
  })

  it("offers a way off the screen, because the hardware back button is blocked", async () => {
    // focusEffectPreventBack() blocks the hardware back so this pairing step is
    // not skipped by accident. With the header control also removed there was
    // no exit at all, and a deep link to /pairing/btclassic trapped the app
    // until a force-stop — five Back presses and a relaunch could not escape
    // it (XERK-249).
    const {getByLabelText} = render(<BtClassicPairingScreen />)

    await act(async () => {
      fireEvent.press(getByLabelText("header-back"))
    })

    expect(goBack).toHaveBeenCalled()
  })
})
