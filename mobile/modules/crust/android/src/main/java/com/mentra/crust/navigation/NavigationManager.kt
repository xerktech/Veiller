package com.mentra.crust.navigation

import android.app.Activity
import android.util.Log

/**
 * Foverlay stub of MentraOS's NavigationManager.
 *
 * The upstream implementation drives on-device turn-by-turn navigation via the
 * Mapbox Navigation SDK, whose Android artifacts resolve only from Mapbox's
 * authenticated Maven repo (paid MAPBOX_DOWNLOADS_TOKEN). Foverlay does not use
 * on-device routing, so the Mapbox engine is removed to drop the secret-token
 * build dependency entirely. The full original lives in the `upstream` remote
 * (Mentra-Community/MentraOS, mobile/modules/crust/.../NavigationManager.kt)
 * and in this repo's git history if ever needed.
 *
 * This stub keeps the EXACT public surface CrustModule.kt depends on (payload
 * data classes, the Callbacks interface, StartOptions, and the public
 * functions), so the rest of the Crust module compiles and runs unchanged.
 * start() reports an error through the callback; everything else is a no-op.
 */
object NavigationManager {
  private const val TAG = "NavigationManager"

  // =====================================================================
  // Wire payloads — field names/types preserved verbatim from upstream
  // (CrustModule and the JS bridge depend on these shapes).
  // =====================================================================

  data class ManeuverPayload(
    /**
     * Categorical type of the upcoming maneuver. One of: STRAIGHT,
     * CONTINUE, SLIGHT_LEFT, SLIGHT_RIGHT, TURN_LEFT, TURN_RIGHT,
     * SHARP_LEFT, SHARP_RIGHT, U_TURN, NAME_CHANGE, DEPART, ARRIVE.
     */
    val maneuverType: String,
    /** Meters from the user's current position to that maneuver. -1 if unknown. */
    val distanceMeters: Int,
    /** Road the user is currently on. Null if unavailable. */
    val fromRoad: String?,
    /** Legacy "next road" field (== fromRoad historically). Kept for back-compat. */
    val toRoad: String?,
    /** Road the user will be on AFTER the upcoming maneuver. Null until known. */
    val nextStepRoad: String?,
    /** Total remaining distance to final destination, meters. -1 if unknown. */
    val distanceToDestinationMeters: Int = -1,
    /** Total remaining travel time, seconds. -1 if unknown. */
    val timeToDestinationSeconds: Int = -1,
    /** Current speed in m/s. Null if unavailable. */
    val currentSpeedMps: Float? = null,
    /** Speed limit on the current road segment in m/s. Null if unknown. */
    val speedLimitMps: Float? = null,
    /** Bearing along the route at the user's current position, 0–360. Null if unknown. */
    val routeHeadingDeg: Float? = null,
    /** Provider's verbatim turn-by-turn instruction text. Null when unavailable. */
    val instruction: String? = null,
  )

  data class LocationPayload(
    val lat: Double,
    val lng: Double,
    val accuracy: Float?,
    val timestamp: Long,
  )

  data class RoutePoint(val lat: Double, val lng: Double)

  /**
   * One step along the active route — used by the SDK's pivot module to
   * enrich pivots with `fromRoad` / `toRoad` metadata. Lat/lng is the
   * step's START coordinate.
   */
  data class RouteStep(
    val lat: Double,
    val lng: Double,
    val routeIndex: Int,
    val road: String?,
    val maneuver: String,
    val distanceMeters: Int,
  )

  interface Callbacks {
    fun onManeuver(payload: ManeuverPayload)
    fun onRerouting()
    fun onArrived()
    fun onError(message: String)
    fun onLocation(payload: LocationPayload)
    fun onRoute(points: List<RoutePoint>, steps: List<RouteStep>?)
    /**
     * Fires once when the user crosses the off-route threshold. Always
     * arrives before `onRerouting` for the same deviation.
     */
    fun onOffRoute(perpendicularDistanceMeters: Double)
  }

  /** Trip configuration. `stops` is the canonical destination list (last is final). */
  data class StartOptions(
    val stops: List<Pair<Double, Double>>,
    val mode: String = "driving",
    val avoidHighways: Boolean = false,
    val avoidTolls: Boolean = false,
    val avoidFerries: Boolean = false,
    val simulate: Boolean = false,
    val speedMultiplier: Float = 1f,
  )

  // =====================================================================
  // Public functions — no-op equivalents of the upstream surface.
  // =====================================================================

  /**
   * Upstream resolved immediately `true` (Mapbox has no runtime T&C dialog).
   * Preserved so callers that pre-trigger T&C keep resolving {accepted:true}.
   */
  fun ensureTermsAccepted(activity: Activity, onResult: (accepted: Boolean) -> Unit) {
    onResult(true)
  }

  fun resetTermsAccepted(activity: Activity) {
    // No-op: no terms state exists in the stub.
  }

  fun start(activity: Activity, options: StartOptions, callbacks: Callbacks) {
    Log.w(TAG, "Navigation is disabled in Foverlay (Mapbox engine removed); start() rejected")
    callbacks.onError("Navigation is not available in this build")
  }

  fun stop() {
    // No-op: nothing to stop.
  }

  fun simulateDeviation(offsetMeters: Double = 0.0) {
    Log.w(TAG, "simulateDeviation($offsetMeters) ignored — navigation disabled")
  }

  fun setWrongSidewalkOffset(enabled: Boolean) {
    // No-op: dev/testing knob for the removed Mapbox engine.
  }

  fun setSkipCrossings(enabled: Boolean) {
    // No-op: dev/testing knob for the removed Mapbox engine.
  }
}
