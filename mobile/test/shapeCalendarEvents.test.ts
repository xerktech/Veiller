/**
 * Calendar → glasses schedule-widget shaping tests.
 *
 * The shaped output is the `calendar_events` device setting: the G2 driver
 * pages it verbatim into the firmware Schedule widget, so these pin the
 * contract — soonest-first order, the entry cap, "All day" labeling, unix-second
 * end timestamps, and location omission.
 */
import {
  GLASSES_CALENDAR_EVENT_LIMIT,
  shapeCalendarEventsForGlasses,
  type PhoneCalendarEventLike,
} from "@/services/calendar/shapeCalendarEvents"

const at = (iso: string) => new Date(iso)

function timedEvent(overrides: Partial<PhoneCalendarEventLike> = {}): PhoneCalendarEventLike {
  return {
    title: "Standup",
    startDate: at("2026-08-04T10:00:00Z"),
    endDate: at("2026-08-04T10:30:00Z"),
    allDay: false,
    ...overrides,
  }
}

describe("shapeCalendarEventsForGlasses", () => {
  test("sorts soonest-first and caps at the widget limit", () => {
    const events = [
      timedEvent({title: "Fourth", startDate: at("2026-08-04T13:00:00Z"), endDate: at("2026-08-04T14:00:00Z")}),
      timedEvent({title: "Second", startDate: at("2026-08-04T11:00:00Z"), endDate: at("2026-08-04T12:00:00Z")}),
      timedEvent({title: "First", startDate: at("2026-08-04T10:00:00Z"), endDate: at("2026-08-04T11:00:00Z")}),
      timedEvent({title: "Third", startDate: at("2026-08-04T12:00:00Z"), endDate: at("2026-08-04T13:00:00Z")}),
    ]
    const shaped = shapeCalendarEventsForGlasses(events)
    expect(shaped).toHaveLength(GLASSES_CALENDAR_EVENT_LIMIT)
    expect(shaped.map((ev) => ev.title)).toEqual(["First", "Second", "Third"])
  })

  test("does not mutate the input array", () => {
    const events = [
      timedEvent({title: "Later", startDate: at("2026-08-04T12:00:00Z")}),
      timedEvent({title: "Sooner", startDate: at("2026-08-04T10:00:00Z")}),
    ]
    shapeCalendarEventsForGlasses(events)
    expect(events[0].title).toBe("Later")
  })

  test("labels timed events as a start-end range and all-day events as All day", () => {
    const [timed, allDay] = shapeCalendarEventsForGlasses([
      timedEvent(),
      timedEvent({
        title: "Holiday",
        startDate: at("2026-08-05T00:00:00Z"),
        endDate: at("2026-08-06T00:00:00Z"),
        allDay: true,
      }),
    ])
    // Exact time strings are locale-dependent; pin the shape, not the locale.
    expect(timed.time).toMatch(/ - /)
    expect(allDay.time).toBe("All day")
  })

  test("endDate is the event end in unix seconds", () => {
    const end = at("2026-08-04T10:30:00Z")
    const [shaped] = shapeCalendarEventsForGlasses([timedEvent({endDate: end})])
    expect(shaped.endDate).toBe(Math.floor(end.getTime() / 1000))
  })

  test("omits location unless present and defaults a missing title to empty", () => {
    const [noLocation, withLocation, noTitle] = shapeCalendarEventsForGlasses([
      timedEvent({title: "A", location: null, startDate: at("2026-08-04T10:00:00Z")}),
      timedEvent({title: "B", location: "Room 3", startDate: at("2026-08-04T11:00:00Z")}),
      timedEvent({title: null, startDate: at("2026-08-04T12:00:00Z")}),
    ])
    expect("location" in noLocation).toBe(false)
    expect(withLocation.location).toBe("Room 3")
    expect(noTitle.title).toBe("")
  })

  test("accepts ISO-string dates as expo-calendar delivers on Android", () => {
    const [shaped] = shapeCalendarEventsForGlasses([
      {title: "ISO", startDate: "2026-08-04T10:00:00Z", endDate: "2026-08-04T11:00:00Z"},
    ])
    expect(shaped.endDate).toBe(Math.floor(at("2026-08-04T11:00:00Z").getTime() / 1000))
  })
})
