import {result as Res} from "typesafe-ts"

import {storage} from "@/utils/storage"
import {SETTINGS, engine} from "@mentra/engine"

import {migrate} from "./Migrations"

jest.mock("@/utils/storage", () => ({
  storage: {
    load: jest.fn(),
    remove: jest.fn(),
    save: jest.fn(),
  },
}))

jest.mock("@mentra/engine", () => ({
  SETTINGS: {
    dashboard_depth: {key: "dashboard_depth"},
    onboarding_os_completed: {key: "onboarding_os_completed"},
    enable_phone_notifications: {key: "enable_phone_notifications"},
  },
  engine: {
    settings: {
      set: jest.fn(),
    },
  },
}))

const mockLoad = jest.mocked(storage.load)
const mockRemove = jest.mocked(storage.remove)
const mockSave = jest.mocked(storage.save)
const mockSet = jest.mocked(engine.settings.set)

/** Route storage.load by key: the migration version plus any per-key values. */
const seedStorage = (version: number, values: Record<string, unknown> = {}) => {
  mockLoad.mockImplementation((key: string) => {
    if (key === "migration_version") return Res.ok(version)
    if (key in values) return Res.ok(values[key])
    return Res.error(new Error(`no value for ${key}`))
  })
}

describe("mobile migrations", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSave.mockReturnValue(Res.ok(undefined))
    mockSet.mockImplementation(() => Res.try_async(async () => undefined))
  })

  it("resets MentraOS onboarding once for users upgrading from version 3", async () => {
    seedStorage(3)

    await migrate()

    expect(mockSet).toHaveBeenCalledWith(SETTINGS.onboarding_os_completed.key, false, false)
    expect(mockSave).toHaveBeenCalledWith("migration_version", 4)
  })

  it("carries the Notify miniapp opt-in into enable_phone_notifications (XERK-219)", async () => {
    seedStorage(4, {"cloud.augmentos.notify_running": true})

    await migrate()

    expect(mockSet).toHaveBeenCalledWith(SETTINGS.enable_phone_notifications.key, true, false)
    expect(mockRemove).toHaveBeenCalledWith("cloud.augmentos.notify_running")
    expect(mockRemove).toHaveBeenCalledWith("cloud.augmentos.notify_screenshot")
    expect(mockRemove).toHaveBeenCalledWith("cloud.augmentos.notify_hidden")
    expect(mockSave).toHaveBeenCalledWith("migration_version", 5)
  })

  it("leaves presentation off for users who never started Notify", async () => {
    seedStorage(4)

    await migrate()

    expect(mockSet).not.toHaveBeenCalledWith(SETTINGS.enable_phone_notifications.key, true, false)
    expect(mockRemove).toHaveBeenCalledWith("cloud.augmentos.notify_running")
    expect(mockSave).toHaveBeenCalledWith("migration_version", 5)
  })

  it("does not run again after all migrations have completed", async () => {
    seedStorage(5)

    await migrate()

    expect(mockSet).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })
})
