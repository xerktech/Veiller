package com.foverlay.tapinput

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
    private val onStatus: (status: String, tapIdentifier: String?, mode: String?) -> Unit,
) : TapSource, TapListener {

    companion object {
        private const val TAG = "FoverlayTapReal"
        private const val NUDGE_INTERVAL_MS = 20_000L

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
     * Periodic connection nudge. TapSdk only enumerates bonded straps at a few
     * fixed moments, so a strap paired AFTER the service starts (or one that
     * drops without a clean disconnect callback) never attaches on its own.
     * While nothing is connected, poke refreshConnections() — unconditional in
     * the 0.3.6 binary — every NUDGE_INTERVAL_MS. No-ops once connected.
     */
    private val reconnectNudge = object : Runnable {
        override fun run() {
            val s = sdk ?: return
            if (connectedTaps.isEmpty()) {
                Log.i(TAG, "No strap connected — nudging refreshConnections()")
                try {
                    s.refreshConnections()
                } catch (e: Exception) {
                    Log.w(TAG, "refreshConnections nudge failed", e)
                }
            }
            handler.postDelayed(this, NUDGE_INTERVAL_MS)
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
        handler.postDelayed(reconnectNudge, NUDGE_INTERVAL_MS)
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
        // The SDK switches to Controller Mode on connect by default, but pin it
        // explicitly so a stray mode change can't silently break input.
        sdk?.startControllerMode(tapIdentifier)
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
        sdk?.startControllerMode(tapIdentifier)
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
    }

    // Demo is tapcodes only — mouse/air-gesture/raw-sensor streams are
    // registered as no-ops to satisfy the interface.
    override fun onMouseInputReceived(tapIdentifier: String, data: MousePacket) {}

    override fun onAirMouseInputReceived(tapIdentifier: String, data: AirMousePacket) {}

    override fun onRawSensorInputReceived(tapIdentifier: String, rsData: RawSensorData) {}
}
