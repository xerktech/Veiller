/**
 * Render tests for the in-app update banner (XERK-232).
 *
 * These drive the real component through every updater state, so they catch the
 * things a unit test of the state machine can't: a translation key that doesn't
 * exist, an icon name that isn't in the registry, or a state that renders the
 * wrong action. The updater itself is mocked — the banner is a pure projection
 * of its state.
 */

import {NavigationContainer} from "@react-navigation/native"
import {render, fireEvent} from "@testing-library/react-native"
import {Platform} from "react-native"

import {initI18n} from "@/i18n"

import {UpdateBanner} from "./UpdateBanner"
import type {UpdateState} from "@/services/update/appUpdater"

// GlassView reaches react-native-inner-shadow → @shopify/react-native-skia,
// which jest-expo's transformIgnorePatterns doesn't cover. It's a pure visual
// shell here, so stand in a plain View rather than widen the shared config.
jest.mock("@/components/ui/GlassView", () => {
  const {View} = require("react-native")
  return {__esModule: true, default: View}
})

let mockState: UpdateState = {kind: "hidden"}
const mockCheck = jest.fn()
const mockAct = jest.fn()
const mockDismiss = jest.fn()

jest.mock("@/services/update/appUpdater", () => ({
  appUpdater: {
    subscribe: () => () => {},
    getState: () => mockState,
    check: (...args: unknown[]) => mockCheck(...args),
    act: () => mockAct(),
    dismiss: () => mockDismiss(),
  },
}))

const renderBanner = () =>
  render(
    <NavigationContainer>
      <UpdateBanner />
    </NavigationContainer>,
  )

const originalPlatform = Platform.OS

// Real translations, so the assertions below are on the copy the user sees and
// a missing/renamed key fails the test instead of silently rendering its name.
beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  jest.clearAllMocks()
  mockState = {kind: "hidden"}
  // The banner is Android-only; jest-expo renders as iOS by default.
  Object.defineProperty(Platform, "OS", {value: "android", configurable: true})
})

afterEach(() => {
  Object.defineProperty(Platform, "OS", {value: originalPlatform, configurable: true})
})

describe("UpdateBanner", () => {
  it("renders nothing on iOS, which updates through the App Store", () => {
    Object.defineProperty(Platform, "OS", {value: "ios", configurable: true})
    mockState = {kind: "available", version: "0.3.2"}
    expect(renderBanner().toJSON()).toBeNull()
  })

  it("renders nothing when there is nothing to offer", () => {
    const {toJSON} = renderBanner()
    expect(toJSON()).toBeNull()
  })

  it("checks for an update when the screen comes into view", () => {
    renderBanner()
    expect(mockCheck).toHaveBeenCalled()
  })

  it("offers Later and Update for an available release", () => {
    mockState = {kind: "available", version: "0.3.2"}
    const {getByText} = renderBanner()

    expect(getByText("Veiller 0.3.2 is available")).toBeDefined()

    fireEvent.press(getByText("Later"))
    expect(mockDismiss).toHaveBeenCalled()

    fireEvent.press(getByText("Update"))
    expect(mockAct).toHaveBeenCalled()
  })

  it("shows progress and no dismiss while downloading", () => {
    mockState = {kind: "downloading", version: "0.3.2", pct: 42}
    const {getByText, queryByText} = renderBanner()

    expect(getByText("Downloading Veiller 0.3.2…")).toBeDefined()
    expect(getByText("42%")).toBeDefined()
    expect(queryByText("Later")).toBeNull()
  })

  it("offers only Install once downloaded — the work is already done", () => {
    mockState = {kind: "readyToInstall", version: "0.3.2"}
    const {getByText, queryByText} = renderBanner()

    expect(getByText("Veiller 0.3.2 is ready to install")).toBeDefined()
    expect(queryByText("Later")).toBeNull()

    fireEvent.press(getByText("Install"))
    expect(mockAct).toHaveBeenCalled()
  })

  it("surfaces a failure with a retry", () => {
    mockState = {kind: "failed", version: "0.3.2", message: "Download failed"}
    const {getByText} = renderBanner()

    expect(getByText("Update failed")).toBeDefined()
    expect(getByText("Download failed")).toBeDefined()

    fireEvent.press(getByText("Retry"))
    expect(mockAct).toHaveBeenCalled()
  })
})
