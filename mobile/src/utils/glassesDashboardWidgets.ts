/**
 * The G2 firmware dashboard's widget pages, and helpers for the enable/disable
 * setting behind the Dashboard settings screen.
 *
 * The `dashboard_widgets` device setting is an ordered array of the ENABLED
 * widget type names; a widget is disabled by leaving it out. The native G2
 * driver maps the names to Even's WidgetType ids (1=News, 2=Stock, 3=Schedule,
 * 4=Quicklist, 5=Health) and sends them as `widgetDisplayOrder` +
 * `widgetDisplayCount` in the dashboard display-settings push.
 */

export type GlassesDashboardWidget = "schedule" | "news" | "stock" | "quicklist" | "health"

/**
 * Every widget the firmware dashboard offers, in display order (Schedule
 * first — matches the order the driver has always pushed).
 */
export const GLASSES_DASHBOARD_WIDGETS: GlassesDashboardWidget[] = ["schedule", "news", "stock", "quicklist", "health"]

/** Default: every widget enabled — what the glasses showed before this setting existed. */
export const DEFAULT_DASHBOARD_WIDGETS: GlassesDashboardWidget[] = [...GLASSES_DASHBOARD_WIDGETS]

/** i18n keys for each widget's toggle row, under the `settings:` namespace. */
export const GLASSES_DASHBOARD_WIDGET_LABEL_KEYS: Record<GlassesDashboardWidget, {label: string; subtitle: string}> = {
  schedule: {label: "dashboardWidgetCalendarLabel", subtitle: "dashboardWidgetCalendarSubtitle"},
  news: {label: "dashboardWidgetNewsLabel", subtitle: "dashboardWidgetNewsSubtitle"},
  stock: {label: "dashboardWidgetStocksLabel", subtitle: "dashboardWidgetStocksSubtitle"},
  quicklist: {label: "dashboardWidgetTasksLabel", subtitle: "dashboardWidgetTasksSubtitle"},
  health: {label: "dashboardWidgetHealthLabel", subtitle: "dashboardWidgetHealthSubtitle"},
}

/** Normalize a stored setting value: drop unknown names, keep canonical order. */
export function normalizeDashboardWidgets(value: unknown): GlassesDashboardWidget[] {
  if (!Array.isArray(value)) return [...DEFAULT_DASHBOARD_WIDGETS]
  return GLASSES_DASHBOARD_WIDGETS.filter((widget) => value.includes(widget))
}

/**
 * Toggle one widget in the enabled list. Re-enabling inserts at the widget's
 * canonical position so the on-glasses page order stays stable.
 */
export function toggleDashboardWidget(current: unknown, widget: GlassesDashboardWidget): GlassesDashboardWidget[] {
  const enabled = normalizeDashboardWidgets(current)
  if (enabled.includes(widget)) {
    return enabled.filter((item) => item !== widget)
  }
  return GLASSES_DASHBOARD_WIDGETS.filter((item) => enabled.includes(item) || item === widget)
}
