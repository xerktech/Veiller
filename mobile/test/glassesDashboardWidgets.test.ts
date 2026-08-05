/**
 * Dashboard-widget setting helper tests.
 *
 * The `dashboard_widgets` setting is an ordered array of ENABLED widget names;
 * the native G2 driver turns it into the firmware `widgetDisplayOrder` push.
 * These pin the toggle semantics: canonical page order is preserved, unknown
 * names are dropped, and an unset value means "everything enabled".
 */
import {
  DEFAULT_DASHBOARD_WIDGETS,
  GLASSES_DASHBOARD_WIDGETS,
  normalizeDashboardWidgets,
  toggleDashboardWidget,
} from "@/utils/glassesDashboardWidgets"

describe("normalizeDashboardWidgets", () => {
  test("unset (null/undefined) means every widget enabled", () => {
    expect(normalizeDashboardWidgets(null)).toEqual(DEFAULT_DASHBOARD_WIDGETS)
    expect(normalizeDashboardWidgets(undefined)).toEqual(DEFAULT_DASHBOARD_WIDGETS)
  })

  test("drops unknown names and keeps canonical order", () => {
    expect(normalizeDashboardWidgets(["health", "bogus", "schedule"])).toEqual(["schedule", "health"])
  })

  test("empty array stays empty — all widgets deliberately off", () => {
    expect(normalizeDashboardWidgets([])).toEqual([])
  })
})

describe("toggleDashboardWidget", () => {
  test("disables an enabled widget", () => {
    expect(toggleDashboardWidget(["schedule", "news", "stock"], "news")).toEqual(["schedule", "stock"])
  })

  test("re-enables at the widget's canonical position", () => {
    expect(toggleDashboardWidget(["schedule", "stock", "health"], "news")).toEqual([
      "schedule",
      "news",
      "stock",
      "health",
    ])
  })

  test("first toggle from unset disables just that widget", () => {
    expect(toggleDashboardWidget(null, "health")).toEqual(["schedule", "news", "stock", "quicklist"])
  })

  test("round-trips back to the full set", () => {
    let value: string[] = toggleDashboardWidget(null, "quicklist")
    value = toggleDashboardWidget(value, "quicklist")
    expect(value).toEqual([...GLASSES_DASHBOARD_WIDGETS])
  })
})
