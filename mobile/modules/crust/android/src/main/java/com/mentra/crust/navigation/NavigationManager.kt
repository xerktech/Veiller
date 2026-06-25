package com.mentra.crust.navigation

import android.app.Activity
import android.util.Log

/**
 * Foverlay stub of MentraOS's NavigationManager.
 *
 * The upstream implementation drives on-device turn-by-turn via the Mapbox
 * Navigation SDK (gated behind a paid MAPBOX_DOWNLOADS_TOKEN). Foverlay does not
 * use on-device routing — navigation is planned as a phone-side Google Maps
 * notification mirror — so the Mapbox engine is removed here to drop the secret-
 * token build dependency. The full original is preserved in the `upstream` remote
 * (Mentra-Community/MentraOS) and git history if ever needed.
 *
 * This keeps the EXACT public surface CrustModule.kt depends on (payload data
 * classes, the Callbacks interface, and the public functions), all as no-ops, so
 * the rest of the Crust module compiles and runs unchanged. Calling start() simply
 * reports an error via the callback; nothing else happens.
 */
object NavigationManager {
  private const val TAG = "NavigationManager"

  // =====================================================================
  // Wire payloads — field names/types preserved (CrustModule + the bridge
  // depend on this shape). Kept identical to upstream.
  // =====================================================================

  data class ManeuverPayload(
    val maneuverType: String,
    val distanceMeters: Int,
    val fromRoad: String?,
    val toRoad: String?,
    val nextStepRoad: String?,
    val distanceToDestinationMeters: Int = -1,
    val timeToDestinationSeconds: Int = -1,
    val currentSpeedMps: Float? = null,
    val speedLimitMps: Float? = null,
    val routeHeadingDeg: Float? = null,
    val instruction: String? = null,
  )

  data class LocationPayload(
    val lat: Double,
    val lng: Double,
    val accuracy: Float?,
    val timestamp: Long,
  )

  data class RoutePoint(val lat: Double, val lng: Double)

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
    fun onOffRoute(perpendicularDistanceMeters: Double)
  }

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
  // Public API — all no-ops in this build.
  // =====================================================================

  /** Upstream had no runtime T&C dialog; it resolved true. Preserve that. */
  fun ensureTermsAccepted(activity: Activity, onResult: (accepted: Boolean) -> Unit) {
    onResult(true)
  }

  fun resetTermsAccepted(activity: Activity) {
    // no-op
  }

  fun start(activity: Activity, options: StartOptions, callbacks: Callbacks) {
    Log.w(TAG, "Navigation is disabled in this build (Mapbox removed). start() ignored.")
    callbacks.onError("Navigation is disabled in this build")
  }

  fun stop() {
    // no-op
  }

  fun simulateDeviation(offsetMeters: Double = 0.0) {
    // no-op (dev tool)
  }

  fun setWrongSidewalkOffset(enabled: Boolean) {
    // no-op (dev tool)
  }

  fun setSkipCrossings(enabled: Boolean) {
    // no-op (dev tool)
  }
}
