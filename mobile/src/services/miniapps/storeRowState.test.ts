import {deriveStoreRowState, type StoreRowInput} from "./storeRowState"

const base: StoreRowInput = {
  availability: "resolved",
  availableVersion: "1.2.0",
  installedVersion: "1.2.0",
  busy: false,
  failed: false,
  enabled: true,
}

const row = (over: Partial<StoreRowInput> = {}) => deriveStoreRowState({...base, ...over})

describe("deriveStoreRowState", () => {
  it("offers Install when nothing is installed", () => {
    // The regression this file exists for: tightening `updateAvailable` to
    // require an installed app also hid the button, so the store could not
    // install anything at all.
    const state = row({installedVersion: null})

    expect(state.status).toBe("notInstalled")
    expect(state.showAction).toBe(true)
    expect(state.action).toBe("install")
  })

  it("does not call it an update when nothing is installed", () => {
    expect(row({installedVersion: null}).status).not.toBe("updateAvailable")
  })

  it("offers Update when a newer version is published", () => {
    const state = row({installedVersion: "1.1.0", availableVersion: "1.2.0"})

    expect(state.status).toBe("updateAvailable")
    expect(state.showAction).toBe(true)
    expect(state.action).toBe("update")
    expect(state.emphasise).toBe(true)
  })

  it("says up to date, with no button, when versions match", () => {
    const state = row()

    expect(state.status).toBe("upToDate")
    expect(state.showAction).toBe(false)
    expect(state.action).toBeNull()
  })

  it("reports a failed check rather than claiming up to date", () => {
    // Offline the row used to keep asserting "Up to date", which the app
    // cannot know — the check is what failed.
    expect(row({availability: "error", availableVersion: null}).status).toBe("checkFailed")
    expect(row({availability: "error", availableVersion: null, installedVersion: null}).status).toBe(
      "checkFailed",
    )
  })

  it("shows the checking state while a lookup is in flight", () => {
    expect(row({availability: "loading", availableVersion: null}).status).toBe("checking")
  })

  it("lets an in-flight install own the status line", () => {
    const state = row({busy: true, installedVersion: null})

    expect(state.status).toBe("stage")
    expect(state.showAction).toBe(true)
    expect(state.emphasise).toBe(true)
  })

  it("keeps a Retry button after a failed attempt", () => {
    const state = row({failed: true, installedVersion: null})

    expect(state.showAction).toBe(true)
    expect(state.action).toBe("retry")
  })

  it("offers nothing for a paused miniapp", () => {
    // Unchecked means updates are paused; re-check it to act.
    expect(row({enabled: false, installedVersion: null}).showAction).toBe(false)
    expect(row({enabled: false, installedVersion: "1.1.0"}).showAction).toBe(false)
  })

  it("offers no action while the latest version is still unknown", () => {
    expect(row({availability: "loading", availableVersion: null, installedVersion: null}).showAction).toBe(
      false,
    )
    expect(row({availability: "error", availableVersion: null, installedVersion: null}).showAction).toBe(
      false,
    )
  })
})
