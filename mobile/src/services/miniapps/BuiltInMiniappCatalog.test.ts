import {Platform} from "react-native"

import {appRegistry} from "@veiller/engine/internal"

import {notifyPackageName, settingsPackageName} from "@/constants/miniapps"

import builtInMiniappCatalog from "./BuiltInMiniappCatalog"

describe("BuiltInMiniappCatalog", () => {
  const originalPlatform = Platform.OS

  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {configurable: true, value: "android"})
  })

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {configurable: true, value: originalPlatform})
  })

  it("does not register Notify — notifications live in Settings (XERK-219)", () => {
    builtInMiniappCatalog.init()

    const installed = (appRegistry.installOfflineApp as jest.Mock).mock.calls.map(([app]) => app.packageName)

    expect(installed).not.toContain(notifyPackageName)
    // Sanity check that registration itself ran.
    expect(installed).toContain(settingsPackageName)
  })
})
