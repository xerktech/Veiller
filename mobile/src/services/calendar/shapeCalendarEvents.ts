/**
 * Shaping phone-calendar events into the glasses calendar-widget contract.
 *
 * The bluetooth-sdk `calendar_events` setting expects `{title, location?, time,
 * endDate}` where `time` is a pre-formatted display label shown verbatim on the
 * glasses and `endDate` is unix SECONDS (the G2 driver folds in the timezone
 * offset and pages the events into the firmware Schedule widget). The widget
 * only surfaces the next few entries, so shaping sorts by start time and caps
 * the list.
 */

/** The glasses-facing event shape (mirrors bluetooth-sdk's `CalendarEvent`). */
export interface GlassesCalendarEvent {
  title: string
  location?: string
  time: string
  endDate: number
}

/** The fields of expo-calendar's `Event` that shaping reads. */
export interface PhoneCalendarEventLike {
  title?: string | null
  location?: string | null
  startDate: string | Date
  endDate: string | Date
  allDay?: boolean
}

/** How many upcoming events are pushed to the glasses schedule widget. */
export const GLASSES_CALENDAR_EVENT_LIMIT = 3

/** Sort soonest-first, cap, and format for the glasses widget. */
export function shapeCalendarEventsForGlasses(events: PhoneCalendarEventLike[]): GlassesCalendarEvent[] {
  return [...events]
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, GLASSES_CALENDAR_EVENT_LIMIT)
    .map((ev) => {
      const start = new Date(ev.startDate)
      const end = new Date(ev.endDate)
      // "10:00 AM - 11:00 AM", or "All day" for all-day events.
      const time = ev.allDay
        ? "All day"
        : `${start.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})} - ${end.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}`
      return {
        title: ev.title ?? "",
        ...(ev.location ? {location: ev.location} : {}),
        time,
        endDate: Math.floor(end.getTime() / 1000),
      }
    })
}
