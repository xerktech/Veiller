/// <reference types="bun-types" />

import {beforeEach, describe, expect, mock, test} from "bun:test"

// Import AFTER the mock so the stubbed timers module wins over ESM hoisting.
import type {ScreenTimeoutManager as ScreenTimeoutManagerType, TimerApi} from "../ScreenTimeoutManager"

// ScreenTimeoutManager imports BgTimer from ../utils/timers, which pulls in
// react-native (Platform/Alert) that bun can't resolve here. The manager under
// test uses an injected clock, so stub the timers module (BgTimer is unused).
mock.module("../../utils/timers", () => ({
  BgTimer: {
    setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id),
  },
}))
const {ScreenTimeoutManager, eventHasContent} =
  require("../ScreenTimeoutManager") as typeof import("../ScreenTimeoutManager")

/** Deterministic, manually-advanced timer surface. */
function makeFakeTimers() {
  let nextId = 1
  let now = 0
  const pending = new Map<number, {cb: () => void; at: number}>()
  const api: TimerApi = {
    setTimeout: (cb, delayMs) => {
      const id = nextId++
      pending.set(id, {cb, at: now + delayMs})
      return id
    },
    clearTimeout: (id) => {
      pending.delete(id)
    },
  }
  const advance = (ms: number) => {
    now += ms
    for (const [id, timer] of [...pending.entries()]) {
      if (timer.at <= now) {
        pending.delete(id)
        timer.cb()
      }
    }
  }
  return {api, advance, pendingCount: () => pending.size}
}

const contentEvent = (text = "hello") => ({view: "main", layout: {layoutType: "text_wall", text}})
const clearEvent = () => ({view: "main", layout: {layoutType: "clear_view"}})

describe("eventHasContent", () => {
  test("text layouts count as content only when non-empty", () => {
    expect(eventHasContent(contentEvent("hi"))).toBe(true)
    expect(eventHasContent({layout: {layoutType: "text_wall", text: "   "}})).toBe(false)
    expect(eventHasContent({layout: {layoutType: "text_wall", text: ""}})).toBe(false)
  })

  test("double_text_wall counts if either half has text", () => {
    expect(eventHasContent({layout: {layoutType: "double_text_wall", topText: "", bottomText: "x"}})).toBe(true)
    expect(eventHasContent({layout: {layoutType: "double_text_wall", topText: "", bottomText: ""}})).toBe(false)
  })

  test("scene counts only with elements; bitmap counts with data", () => {
    expect(eventHasContent({layout: {layoutType: "scene", elements: [{}]}})).toBe(true)
    expect(eventHasContent({layout: {layoutType: "scene", elements: []}})).toBe(false)
    expect(eventHasContent({layout: {layoutType: "bitmap_view", data: "AA"}})).toBe(true)
    expect(eventHasContent({layout: {layoutType: "bitmap_view", data: ""}})).toBe(false)
  })

  test("clear / empty / unknown handled", () => {
    expect(eventHasContent(clearEvent())).toBe(false)
    expect(eventHasContent({})).toBe(false)
    expect(eventHasContent(null)).toBe(false)
    // Unknown non-clear layouts default to content.
    expect(eventHasContent({layout: {layoutType: "reference_card", title: "t"}})).toBe(true)
  })
})

describe("ScreenTimeoutManager", () => {
  let timers: ReturnType<typeof makeFakeTimers>
  let blank: ReturnType<typeof mock>
  let mgr: ScreenTimeoutManagerType

  beforeEach(() => {
    timers = makeFakeTimers()
    blank = mock(() => {})
    mgr = new ScreenTimeoutManager(blank, timers.api)
  })

  test("blanks the display after the configured idle timeout", () => {
    mgr.setTimeoutSeconds(30)
    mgr.noteDisplayEvent(contentEvent())
    expect(mgr._isArmed()).toBe(true)

    timers.advance(29_000)
    expect(blank).not.toHaveBeenCalled()

    timers.advance(1_000)
    expect(blank).toHaveBeenCalledTimes(1)
    expect(mgr._isArmed()).toBe(false)
  })

  test("never (0) never arms or blanks", () => {
    mgr.setTimeoutSeconds(0)
    mgr.noteDisplayEvent(contentEvent())
    expect(mgr._isArmed()).toBe(false)
    timers.advance(600_000)
    expect(blank).not.toHaveBeenCalled()
  })

  test("new content resets the idle countdown", () => {
    mgr.setTimeoutSeconds(30)
    mgr.noteDisplayEvent(contentEvent("first"))
    timers.advance(20_000)
    // Fresh content 20s in → timer restarts, so 20s more must NOT fire yet.
    mgr.noteDisplayEvent(contentEvent("second"))
    timers.advance(20_000)
    expect(blank).not.toHaveBeenCalled()
    // 10s more (30s since the second event) fires.
    timers.advance(10_000)
    expect(blank).toHaveBeenCalledTimes(1)
  })

  test("a clear event cancels a pending timer (screen already off)", () => {
    mgr.setTimeoutSeconds(30)
    mgr.noteDisplayEvent(contentEvent())
    expect(mgr._isArmed()).toBe(true)
    mgr.noteDisplayEvent(clearEvent())
    expect(mgr._isArmed()).toBe(false)
    timers.advance(60_000)
    expect(blank).not.toHaveBeenCalled()
  })

  test("switching to never cancels a running timer", () => {
    mgr.setTimeoutSeconds(30)
    mgr.noteDisplayEvent(contentEvent())
    expect(mgr._isArmed()).toBe(true)
    mgr.setTimeoutSeconds(0)
    expect(mgr._isArmed()).toBe(false)
    timers.advance(60_000)
    expect(blank).not.toHaveBeenCalled()
  })

  test("shortening the timeout re-arms from now with the new value", () => {
    mgr.setTimeoutSeconds(300)
    mgr.noteDisplayEvent(contentEvent())
    timers.advance(10_000)
    mgr.setTimeoutSeconds(15)
    // Re-armed at the change; 15s from the change (not 5s remaining of 300) fires.
    timers.advance(14_000)
    expect(blank).not.toHaveBeenCalled()
    timers.advance(1_000)
    expect(blank).toHaveBeenCalledTimes(1)
  })

  test("dispose cancels any pending timer", () => {
    mgr.setTimeoutSeconds(30)
    mgr.noteDisplayEvent(contentEvent())
    mgr.dispose()
    timers.advance(60_000)
    expect(blank).not.toHaveBeenCalled()
  })
})
