/**
 * Injected miniapp WebView globals.
 *
 * `buildMiniappGlobalsScript` produces the JS the host evaluates in every
 * miniapp WebView before the miniapp's own bundle loads. These pin the
 * contract that miniapps read: the `window.Veiller` object, its pre-rename
 * `window.MentraOS` alias, and the safe-area / capsule CSS custom properties
 * under both prefixes (XERK-229).
 *
 * Lives in the Jest suite rather than beside the engine's bun tests because
 * the module imports `react-native` (Platform / Dimensions), which only
 * resolves under the jest-expo preset.
 */
// Engine source has no @/ alias, and the @veiller/engine/internal entry is
// stubbed in jest.setup.js — reach the real module directly, as the other
// engine-source Jest suites do.
// eslint-disable-next-line no-restricted-imports
import {buildMiniappGlobalsScript} from "../modules/engine/src/utils/miniappGlobals"

const INSETS = {top: 59, bottom: 34, left: 0, right: 0}

describe("buildMiniappGlobalsScript", () => {
  it("assigns window.Veiller with the requested fields", () => {
    const src = buildMiniappGlobalsScript({packageName: "com.example.app", safeAreaInsets: INSETS})
    expect(src).toContain("window.Veiller = ")
    expect(src).toContain('"packageName":"com.example.app"')
  })

  it("emits the --veiller-* CSS custom properties", () => {
    const src = buildMiniappGlobalsScript({safeAreaInsets: INSETS})
    expect(src).toContain("--veiller-safe-top: 59px;")
    expect(src).toContain("--veiller-safe-bottom: 34px;")
    expect(src).toContain("--veiller-capsule-gutter:")
  })

  /**
   * XERK-229: miniapp bundles published before the Veiller rename (XERK-220)
   * read `window.MentraOS` and style themselves off `var(--mentra-safe-top)`.
   * Those bundles are immutable release artifacts, so the host injects both
   * spellings. The alias points at the same object, so anything the host
   * later mutates stays visible through either name.
   */
  it("aliases the pre-rename window.MentraOS global to the same object", () => {
    const src = buildMiniappGlobalsScript({packageName: "com.example.app", safeAreaInsets: INSETS})
    expect(src).toContain("window.MentraOS = window.Veiller;")
  })

  it("emits the pre-rename --mentra-* CSS custom properties alongside --veiller-*", () => {
    const src = buildMiniappGlobalsScript({safeAreaInsets: INSETS})
    expect(src).toContain("--mentra-safe-top: 59px;")
    expect(src).toContain("--mentra-safe-bottom: 34px;")
    expect(src).toContain("--mentra-capsule-top:")
    expect(src).toContain("--mentra-capsule-gutter:")
  })
})
