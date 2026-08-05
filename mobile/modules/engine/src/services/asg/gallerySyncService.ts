/**
 * Gallery Sync Service — parked stub.
 *
 * XERK-200/XERK-206: the Mentra Live camera/gallery ("ASG") subsystem is parked.
 * The real implementation (hotspot → wifi → HTTP fetch → process → store
 * orchestration) depended on react-native-wifi-reborn, which has been removed
 * from the app. This stub keeps the export surface consumed by engine.ts,
 * internal.ts, and facades/gallery.ts so the parked subsystem stays compiled
 * out without breaking the engine's public API shape.
 *
 * The full implementation is restorable from git history
 * (mobile/modules/engine/src/services/asg/gallerySyncService.ts prior to
 * XERK-200-3).
 */

const PARKED_MESSAGE = "ASG gallery is parked (XERK-206)"

export const gallerySyncService = {
  /** No-op: the parked service registers no listeners and starts nothing. */
  initialize(): void {
    // Intentionally empty — boot-time initialization of the parked subsystem
    // was removed (see engine.ts / MantleManager.ts XERK-200 notes).
  },

  /** No-op counterpart to initialize(). */
  cleanup(): void {
    // Intentionally empty.
  },

  /** Rejects: gallery sync is unavailable while the subsystem is parked. */
  async startSync(): Promise<void> {
    throw new Error(PARKED_MESSAGE)
  },

  /** Rejects: nothing to cancel while the subsystem is parked. */
  async cancelSync(): Promise<void> {
    throw new Error(PARKED_MESSAGE)
  },

  /** Rejects: glasses gallery status queries are unavailable while parked. */
  async queryGlassesGalleryStatus(): Promise<void> {
    throw new Error(PARKED_MESSAGE)
  },
}
