package com.foverlay.tapinput

import android.bluetooth.BluetoothGatt
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.tapwithus.sdk.TapListener
import com.tapwithus.sdk.TapSdk
import com.tapwithus.sdk.TapSdkFactory
import com.tapwithus.sdk.airmouse.AirMousePacket
import com.tapwithus.sdk.mode.RawSensorData
import com.tapwithus.sdk.mode.TapInputMode
import com.tapwithus.sdk.mouse.MousePacket

/**
 * Tap Strap 2 input via the tap-android-sdk (io.github.tapwithus:tap-android-sdk)
 * in Controller Mode.
 *
 * Controller Mode, not Bluetooth HID: Android routes HID key events to the
 * focused window, and "phone in pocket, screen off" has no focused window.
 * In Controller Mode the SDK owns a direct BLE GATT connection and delivers
 * raw tapcodes through this listener regardless of screen state — as long as
 * a foreground service (TapInputService) keeps the process alive.
 *
 * Notes on SDK behavior (verified against the 0.3.6 binary):
 *  - The SDK does not scan or pair. The Tap must already be paired in Android
 *    Bluetooth settings; the SDK auto-attaches to bonded Taps and auto-switches
 *    them to Controller Mode on connect.
 *  - By default the SDK flips the Tap back to Text Mode (HID keyboard) when the
 *    app backgrounds. That would kill screen-off input, so we call
 *    disablePauseResumeHandling() and pin Controller Mode ourselves.
 *  - Reconnection: the SDK re-establishes bonded connections; onTapDisconnected
 *    → onTapConnected cycles are logged and surfaced as status events. We also
 *    nudge it with refreshConnections() on disconnect.
 */
class RealTapSource(
    private val context: Context,
    private val sink: TapSink,
    initialControlEnabled: Boolean,
    private val onStatus: (status: String, tapIdentifier: String?, mode: String?) -> Unit,
) : TapSource, TapListener {

    companion object {
        private const val TAG = "FoverlayTapReal"
        private const val MAINTAIN_INTERVAL_MS = 20_000L
        private const val INITIAL_MAINTAIN_MS = 1_500L

        /**
         * Human name for the state int onTapChangedState reports. The SDK
         * delivers TapInputMode.type values here; unknown ints are surfaced
         * verbatim rather than guessed at.
         */
        fun modeName(state: Int): String = when (state) {
            TapInputMode.TEXT -> "text (HID keyboard)"
            TapInputMode.CONTROLLER -> "controller"
            TapInputMode.CONTROLLER_WITH_MOUSEHID -> "controller+mouseHID"
            TapInputMode.CONTROLLER_WITH_FULLHID -> "controller+fullHID"
            TapInputMode.RAW_SENSOR -> "raw sensor"
            else -> "unknown($state)"
        }
    }

    private var sdk: TapSdk? = null
    private val handler = Handler(Looper.getMainLooper())
    private val connectedTaps = mutableSetOf<String>()

    /**
     * User toggle. true  = Controller Mode: the SDK owns the strap and drives
     *                      the glasses (no HID keystrokes to the phone).
     *          false = Text Mode: the strap behaves as a normal Bluetooth
     *                      keyboard; the SDK receives no input.
     */
    @Volatile
    private var controlEnabled: Boolean = initialControlEnabled

    /** Apply the toggle's desired mode to one connected strap. */
    private fun applyDesiredMode(tapIdentifier: String) {
        val s = sdk ?: return
        try {
            if (controlEnabled) {
                s.startControllerMode(tapIdentifier)
            } else {
                s.startTextMode(tapIdentifier)
            }
        } catch (e: Exception) {
            // A mode write can throw if the strap dropped between discovery and
            // here — never let it crash the app.
            Log.w(TAG, "applyDesiredMode($tapIdentifier) failed", e)
        }
    }

    /**
     * Flip control on/off at runtime (from the phone toggle). Re-applies the
     * mode to every connected strap immediately.
     */
    fun setControlEnabled(enabled: Boolean) {
        controlEnabled = enabled
        Log.i(TAG, "Control ${if (enabled) "ENABLED (Controller Mode)" else "DISABLED (Text/keyboard Mode)"}")
        val s = sdk ?: return
        if (enabled) {
            // Turning control ON doubles as a manual "(re)connect + take
            // control" action: kick a connection refresh so a strap that
            // powered on / connected AFTER the app opened gets attached now
            // (onTapConnected then pins it), and run a maintenance pass
            // immediately so any already-connected strap is pinned without
            // waiting for the next tick — no app restart needed.
            try {
                s.refreshConnections()
            } catch (e: Exception) {
                Log.w(TAG, "refreshConnections on enable failed", e)
            }
            handler.removeCallbacks(maintain)
            handler.post(maintain)
        }
        for (id in connectedTaps) applyDesiredMode(id)
    }

    /**
     * Periodic maintenance — two jobs, both essential:
     *
     *  1. Reconnect nudge: TapSdk only enumerates bonded straps at a few fixed
     *     moments, so a strap paired/powered-on AFTER the service starts never
     *     attaches on its own. While nothing is connected, poke
     *     refreshConnections() (unconditional in the 0.3.6 binary).
     *
     *  2. Pin Controller Mode on ALREADY-connected straps. onTapConnected only
     *     fires for a *fresh* connection; a strap that was already connected
     *     when we registered (the normal case — it stays bonded across app
     *     restarts) never triggers it, so startControllerMode() is never
     *     called and input notifications are never subscribed. Symptom:
     *     "Connected — mode: controller" but zero chords. So each tick, pin
     *     controller mode on any connected strap we haven't pinned yet.
     */
    private val maintain = object : Runnable {
        override fun run() {
            val s = sdk ?: return
            val connected = try {
                s.getConnectedTaps()
            } catch (e: Exception) {
                Log.w(TAG, "getConnectedTaps failed", e)
                emptySet<String>()
            }
            if (connected.isEmpty()) {
                Log.i(TAG, "No strap connected — nudging refreshConnections()")
                connectedTaps.clear()
                try {
                    s.refreshConnections()
                } catch (e: Exception) {
                    Log.w(TAG, "refreshConnections nudge failed", e)
                }
            } else {
                for (id in connected) {
                    if (connectedTaps.add(id)) {
                        Log.i(TAG, "Already-connected strap $id — applying desired mode")
                        applyDesiredMode(id)
                        onStatus("connected", id, null)
                    }
                }
                // Re-assert low-power priority each tick: Android/peripheral can
                // renegotiate the interval after connect, and this must win back
                // radio time for the G2 display links.
                relaxStrapConnectionPriority()
            }
            handler.postDelayed(this, MAINTAIN_INTERVAL_MS)
        }
    }

    /**
     * Drop the strap's BLE connection to LOW_POWER priority so it stops
     * starving the G2's two display links on the single phone radio.
     *
     * Why this is the fix: the phone holds three GATT links at once — the Tap
     * strap plus one per G2 temple arm. At Android's default interval the strap
     * competes for radio time it doesn't need (it sends only tiny, infrequent
     * chords), and the symptom is the G2 "displaying" frames that never repaint
     * until the link drops and replays. LOW_POWER (~100–125 ms interval) is
     * plenty for chords and frees the radio for the display.
     *
     * The tap-android-sdk (0.3.6) owns the strap's BluetoothGatt in a private
     * static map and exposes no connection-priority control, so we reach it by
     * reflection (field names are un-obfuscated in the shipped AAR). Best-effort
     * and fail-soft: if the SDK internals ever change we log and move on rather
     * than crash. The proper long-term fix is a forked SDK that exposes this.
     */
    private fun relaxStrapConnectionPriority() {
        try {
            val field = Class.forName("com.tapwithus.sdk.bluetooth.BluetoothManager")
                .getDeclaredField("gatts")
                .apply { isAccessible = true }
            val gatts = field.get(null) as? Map<*, *> ?: return
            for (value in gatts.values) {
                (value as? BluetoothGatt)?.let { gatt ->
                    val ok = gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_LOW_POWER)
                    Log.i(TAG, "Strap LOW_POWER connection priority requested: $ok")
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Could not relax strap connection priority (SDK internals changed?)", t)
        }
    }

    override fun start() {
        if (sdk != null) return
        Log.i(TAG, "Starting tap-android-sdk (Controller Mode, background handling disabled)")
        val s = TapSdkFactory.getDefault(context.applicationContext)
        s.registerTapListener(this)
        // ORDER MATTERS (verified against the 0.3.6 bytecode): resume() is the
        // call that re-establishes connections to bonded straps, and it
        // EARLY-RETURNS when pauseResumeHandling is false. So resume first,
        // kick an explicit refresh, and only then disable pause/resume
        // handling — which we still want off so backgrounding never flips the
        // strap back to Text Mode (HID) and kills screen-off input.
        s.resume()
        s.refreshConnections()
        s.disablePauseResumeHandling()
        sdk = s
        // Run the first maintenance pass shortly after resume() has had a
        // moment to (re)establish the GATT link, so an already-connected strap
        // gets Controller Mode pinned within a second or two rather than a full
        // interval later.
        handler.postDelayed(maintain, INITIAL_MAINTAIN_MS)
    }

    override fun stop() {
        val s = sdk ?: return
        sdk = null
        handler.removeCallbacksAndMessages(null)
        connectedTaps.clear()
        try {
            s.unregisterTapListener(this)
            // Hand the Tap back to normal keyboard behavior when the service stops.
            for (id in s.getConnectedTaps()) s.startTextMode(id)
            s.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error shutting down TapSdk", e)
        }
    }

    // --- TapListener ---

    override fun onTapInputReceived(tapIdentifier: String, data: Int, repeatData: Int) {
        val now = System.currentTimeMillis()
        // repeatData is 0 on firmwares that don't report repeats; normalize to 1.
        val repeat = if (repeatData in 2..3) repeatData else 1
        val result = TapAlphabet.decode(data, repeat)
        if (result is TapAlphabet.Result.Unmapped) {
            Log.i(TAG, "Unmapped tapcode=$data repeat=$repeat from $tapIdentifier")
        }
        sink(result, data, repeat, now, "real")
    }

    override fun onTapConnected(tapIdentifier: String) {
        Log.i(TAG, "Tap connected: $tapIdentifier — pinning Controller Mode")
        connectedTaps.add(tapIdentifier)
        // Apply the toggle's desired mode explicitly so a stray default can't
        // leave us in the wrong mode.
        applyDesiredMode(tapIdentifier)
        relaxStrapConnectionPriority()
        onStatus("connected", tapIdentifier, null)
    }

    override fun onTapDisconnected(tapIdentifier: String) {
        Log.i(TAG, "Tap disconnected: $tapIdentifier")
        connectedTaps.remove(tapIdentifier)
        onStatus("disconnected", tapIdentifier, null)
        // Recovery must be automatic, not user-initiated. The SDK reconnects
        // bonded devices on its own; refreshConnections() nudges it in case
        // the drop left a stale cache entry.
        try {
            sdk?.refreshConnections()
        } catch (e: Exception) {
            Log.w(TAG, "refreshConnections failed", e)
        }
    }

    override fun onTapStartConnecting(tapIdentifier: String) {
        onStatus("connecting", tapIdentifier, null)
    }

    override fun onTapResumed(tapIdentifier: String) {
        Log.i(TAG, "Tap resumed: $tapIdentifier — pinning Controller Mode")
        connectedTaps.add(tapIdentifier)
        applyDesiredMode(tapIdentifier)
        onStatus("connected", tapIdentifier, null)
    }

    override fun onError(tapIdentifier: String, code: Int, description: String) {
        Log.w(TAG, "TapSdk error $code for $tapIdentifier: $description")
        onStatus("error", tapIdentifier, null)
    }

    override fun onBluetoothTurnedOn() {
        Log.i(TAG, "Bluetooth on")
    }

    override fun onBluetoothTurnedOff() {
        Log.i(TAG, "Bluetooth off")
        onStatus("bluetooth_off", null, null)
    }

    override fun onTapShiftSwitchReceived(tapIdentifier: String, data: Int) {
        // Shift / layer-switch state. Layers are stubbed for the demo — log only.
        val decoded = TapSdk.toShiftAndSwitch(data)
        Log.i(TAG, "Shift/switch state from $tapIdentifier: shift=${decoded[0]} switch=${decoded[1]} (layers stubbed)")
    }

    override fun onTapChanged(tapIdentifier: String) {}

    override fun onTapChangedState(tapIdentifier: String, state: Int) {
        val mode = modeName(state)
        Log.i(TAG, "Tap $tapIdentifier mode: $mode")
        onStatus("mode_changed", tapIdentifier, mode)
        // If the strap drifts off Controller Mode while connected, input stops
        // reaching us — re-pin it.
        if (controlEnabled && state != TapInputMode.CONTROLLER && connectedTaps.contains(tapIdentifier)) {
            Log.i(TAG, "Tap $tapIdentifier left Controller Mode ($mode) — re-pinning")
            sdk?.startControllerMode(tapIdentifier)
        }
    }

    // Demo is tapcodes only — mouse/air-gesture/raw-sensor streams are
    // registered as no-ops to satisfy the interface.
    override fun onMouseInputReceived(tapIdentifier: String, data: MousePacket) {}

    override fun onAirMouseInputReceived(tapIdentifier: String, data: AirMousePacket) {}

    override fun onRawSensorInputReceived(tapIdentifier: String, rsData: RawSensorData) {}
}
