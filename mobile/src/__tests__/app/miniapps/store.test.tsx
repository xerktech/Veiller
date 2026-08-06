/**
 * Miniapp Store install/update feedback (XERK-225).
 *
 * The reported bug was that tapping "Update" appeared to do nothing. These
 * tests pin the two halves of the fix: the row narrates each stage of an
 * in-flight install, and it ends on a visible outcome — a success line or the
 * failure reason — instead of silently reverting to its previous state.
 */

jest.mock("@/i18n", () => ({
  translate: jest.fn((key: string, vars?: Record<string, string>) =>
    vars ? `${key}:${Object.values(vars).join(",")}` : key,
  ),
}))

jest.mock("@/config/veillerMiniapps", () => ({
  VEILLER_MINIAPPS: [{repo: "xerktech/Turma", packageName: "com.xerktech.turma", name: "Turma"}],
}))

const mockInstallLatest = jest.fn()
const mockResolveLatestBundle = jest.fn()
jest.mock("@/services/miniapps/veillerMiniappSync", () => ({
  veillerMiniappSync: {installLatest: (...args: unknown[]) => mockInstallLatest(...args)},
  resolveLatestBundle: (...args: unknown[]) => mockResolveLatestBundle(...args),
}))

jest.mock("@/services/miniapps/veillerMiniappPrefs", () => ({
  isVeillerMiniappEnabled: () => true,
  setVeillerMiniappEnabled: jest.fn(),
}))

const mockShowAlert = jest.fn()
jest.mock("@/contexts/ModalContext", () => ({
  showAlert: (...args: unknown[]) => mockShowAlert(...args),
}))

jest.mock("@/contexts/ThemeContext", () => ({
  useAppTheme: () => ({theme: {colors: {text: "#111", textDim: "#888", success: "#0a0", error: "#a00"}}}),
}))

jest.mock("@/stores/navigation", () => ({
  useNavigationStore: {getState: () => ({goBack: jest.fn()})},
}))

const mockMiniappList = jest.fn()
jest.mock("@veiller/engine", () => ({
  engine: {
    miniapps: {
      list: () => mockMiniappList(),
      refresh: jest.fn(),
      onChanged: () => () => {},
    },
  },
}))

jest.mock("@/components/ui/GlassView", () => {
  const {View} = require("react-native")
  function MockGlassView({children}: {children: ReactNode}) {
    return <View>{children}</View>
  }
  return MockGlassView
})

jest.mock("@/components/ignite", () => {
  const {Text: RNText, TouchableOpacity, View} = require("react-native")
  function MockScreen({children}: {children: ReactNode}) {
    return <View>{children}</View>
  }
  function MockHeader() {
    return <View />
  }
  function MockText({text}: {text?: string}) {
    return <RNText>{text}</RNText>
  }
  function MockButton({text, onPress, disabled}: {text?: string; onPress?: () => void; disabled?: boolean}) {
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled} testID="action-button">
        <RNText>{text}</RNText>
      </TouchableOpacity>
    )
  }
  function MockSwitch() {
    return <View />
  }
  return {Screen: MockScreen, Header: MockHeader, Text: MockText, Button: MockButton, Switch: MockSwitch}
})

import {act, render, fireEvent, waitFor} from "@testing-library/react-native"
import type {ReactNode} from "react"

import MiniappStorePage from "@/app/miniapps/store"

/** A deferred promise so a test can hold an install mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

beforeEach(() => {
  jest.clearAllMocks()
  // Turma installed at 0.6.52, with 0.6.53 published — the store's
  // "Update available" state.
  mockMiniappList.mockReturnValue([{packageName: "com.xerktech.turma", name: "Turma", version: "0.6.52"}])
  mockResolveLatestBundle.mockResolvedValue({
    packageName: "com.xerktech.turma",
    version: "0.6.53",
    downloadUrl: "https://example.test/turma-veiller-v0.6.53.zip",
    assetName: "turma-veiller-v0.6.53.zip",
  })
})

describe("Miniapp Store update feedback", () => {
  it("narrates each stage while the update runs, then reports success", async () => {
    const gate = deferred<{packageName: string; version: string}>()
    let report: ((stage: string) => void) | undefined
    mockInstallLatest.mockImplementation((_source: unknown, onProgress: (stage: string) => void) => {
      report = onProgress
      return gate.promise
    })

    const screen = render(<MiniappStorePage />)
    await waitFor(() => expect(screen.getByText("miniappStore:updateAvailable")).toBeTruthy())

    fireEvent.press(screen.getByTestId("action-button"))

    // The tap is acknowledged immediately, before any network work finishes.
    await waitFor(() => expect(screen.getByText("miniappStore:stageChecking")).toBeTruthy())

    await act(async () => report!("downloading"))
    expect(screen.getByText("miniappStore:stageDownloading")).toBeTruthy()

    await act(async () => report!("installing"))
    expect(screen.getByText("miniappStore:stageInstalling")).toBeTruthy()

    await act(async () => {
      gate.resolve({packageName: "com.xerktech.turma", version: "0.6.53"})
      await gate.promise
    })
    await waitFor(() => expect(screen.getByText("miniappStore:updateSucceeded:0.6.53")).toBeTruthy())
    expect(mockShowAlert).not.toHaveBeenCalled()
  })

  it("leaves the failure reason on screen and offers a retry", async () => {
    mockInstallLatest.mockRejectedValue(new Error("bundle download failed"))

    const screen = render(<MiniappStorePage />)
    await waitFor(() => expect(screen.getByText("miniappStore:updateAvailable")).toBeTruthy())

    fireEvent.press(screen.getByTestId("action-button"))

    await waitFor(() =>
      expect(screen.getByText("miniappStore:installFailedStatus:bundle download failed")).toBeTruthy(),
    )
    expect(mockShowAlert).toHaveBeenCalled()
    // The button stays, relabelled, so the user can try again.
    expect(screen.getByText("miniappStore:retry")).toBeTruthy()
  })

  it("settles on 'up to date' after a successful update instead of re-offering it", async () => {
    // The version the repo publishes is what got installed, so the row must
    // stop advertising an update once it has been applied — the loop that made
    // the original bug look like "nothing happened".
    mockInstallLatest.mockResolvedValue({packageName: "com.xerktech.turma", version: "0.6.53"})
    mockMiniappList.mockReturnValue([{packageName: "com.xerktech.turma", name: "Turma", version: "0.6.53"}])
    mockResolveLatestBundle.mockResolvedValue({
      packageName: "com.xerktech.turma",
      version: "0.6.57", // stale tag-derived value; the install reports the truth
      downloadUrl: "https://example.test/turma-veiller-v0.6.53.zip",
      assetName: "turma-veiller-v0.6.53.zip",
    })

    const screen = render(<MiniappStorePage />)
    await waitFor(() => expect(screen.getByText("miniappStore:updateAvailable")).toBeTruthy())

    fireEvent.press(screen.getByTestId("action-button"))

    await waitFor(() => expect(screen.getByText("miniappStore:upToDate")).toBeTruthy())
    expect(screen.queryByText("miniappStore:updateAvailable")).toBeNull()
    expect(screen.queryByTestId("action-button")).toBeNull()
  })
})
