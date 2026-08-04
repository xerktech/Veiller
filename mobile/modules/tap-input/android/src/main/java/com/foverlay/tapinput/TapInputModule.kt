package com.foverlay.tapinput

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

/**
 * Expo module bridging TapInputService's decoded tap events into React Native.
 *
 * Event payloads mirror what the engine consumes:
 *
 *   tap_input: {
 *     char: string | null   // printable char (" " space, "\n" enter) or null
 *     action: "char" | "backspace" | "shift" | "switch" | "unmapped"
 *     tapcode: number       // raw 5-bit finger bitmask, 1–31
 *     repeat: number        // 1 = single tap, 2 = double, 3 = triple
 *     timestamp: number     // wall-clock ms at the native SDK callback
 *     source: "real" | "fake" | "test"
 *   }
 *
 *   tap_status: { status: "connecting"|"connected"|"disconnected"|"mode_changed"|
 *                         "error"|"bluetooth_off",
 *                 tapIdentifier: string | null,
 *                 mode: string | null }   // e.g. "controller", "text" — see RealTapSource
 *
 * The companion also keeps a status registry (connected straps + last known
 * mode, chord counters, last decoded chord) so the UI can render a full
 * snapshot at any time via getStatus() without replaying events.
 */
class TapInputModule : Module() {

    companion object {
        private const val TAG = "FoverlayTapModule"
        const val EVENT_TAP_INPUT = "tap_input"
        const val EVENT_TAP_STATUS = "tap_status"

        @Volatile
        private var instance: TapInputModule? = null

        // --- status registry (read by getStatus, updated by emit*) ---
        private val tapModes = ConcurrentHashMap<String, String>()
        @Volatile private var lastStatus: String? = null
        @Volatile private var tapCount = 0
        @Volatile private var lastChord: Map<String, Any?>? = null

        fun emitTap(
            result: TapAlphabet.Result,
            tapcode: Int,
            repeat: Int,
            timestampMs: Long,
            source: String,
        ) {
            val (char: String?, action: String) = when (result) {
                is TapAlphabet.Result.Text -> result.char.toString() to "char"
                is TapAlphabet.Result.Backspace -> null to "backspace"
                is TapAlphabet.Result.Shift -> null to "shift"
                is TapAlphabet.Result.Switch -> null to "switch"
                is TapAlphabet.Result.Unmapped -> null to "unmapped"
            }
            val payload = mapOf(
                "char" to char,
                "action" to action,
                "tapcode" to tapcode,
                "repeat" to repeat,
                "timestamp" to timestampMs,
                "source" to source,
            )
            tapCount += 1
            lastChord = payload

            val module = instance
            if (module == null) {
                // Service can outlive the RN context (START_STICKY restart
                // before the app process re-registers). Drop, don't crash.
                Log.w(TAG, "tap_input dropped — JS bridge not attached (tapcode=$tapcode)")
                return
            }
            module.sendEvent(EVENT_TAP_INPUT, payload)
        }

        fun emitStatus(status: String, tapIdentifier: String?, mode: String?) {
            lastStatus = status
            if (tapIdentifier != null) {
                when (status) {
                    "connecting" -> tapModes[tapIdentifier] = tapModes[tapIdentifier] ?: "unknown"
                    "connected" -> tapModes.putIfAbsent(tapIdentifier, "unknown")
                    "mode_changed" -> if (mode != null) tapModes[tapIdentifier] = mode
                    "disconnected" -> tapModes.remove(tapIdentifier)
                }
            }
            instance?.sendEvent(
                EVENT_TAP_STATUS,
                mapOf("status" to status, "tapIdentifier" to tapIdentifier, "mode" to mode),
            )
        }

        fun snapshot(context: android.content.Context?): Map<String, Any?> = mapOf(
            "serviceRunning" to TapInputService.isRunning,
            "controlEnabled" to (context?.let { TapInputService.isControlEnabled(it) } ?: true),
            "realSource" to TapInputService.realSourceState,
            "bondedTaps" to TapInputService.bondedTapNames(),
            "taps" to tapModes.map { (id, mode) -> mapOf("tapIdentifier" to id, "mode" to mode) },
            "tapCount" to tapCount,
            "lastChord" to lastChord,
            "lastStatus" to lastStatus,
        )
    }

    override fun definition() = ModuleDefinition {
        Name("TapInput")

        Events(EVENT_TAP_INPUT, EVENT_TAP_STATUS)

        OnCreate {
            instance = this@TapInputModule
        }

        OnDestroy {
            if (instance === this@TapInputModule) instance = null
        }

        AsyncFunction("start") {
            val context = appContext.reactContext
                ?: throw IllegalStateException("No React context available")
            TapInputService.start(context)
        }

        AsyncFunction("stop") {
            val context = appContext.reactContext
                ?: throw IllegalStateException("No React context available")
            TapInputService.stop(context)
        }

        Function("isRunning") {
            TapInputService.isRunning
        }

        /** Full status snapshot for the phone UI (strap list, modes, counters). */
        Function("getStatus") {
            snapshot(appContext.reactContext)
        }

        /**
         * Inject one character through the SAME sink real chords use
         * (TapAlphabet reverse-lookup → decoded event → JS → echo → display).
         * Lets the UI's "send test tap" button exercise the phone→glasses leg
         * without strap hardware or adb.
         */
        AsyncFunction("setControl") { enabled: Boolean ->
            val context = appContext.reactContext
                ?: throw IllegalStateException("No React context available")
            TapInputService.setControlEnabled(context, enabled)
            sendEvent(EVENT_TAP_STATUS, mapOf("status" to "control_changed", "tapIdentifier" to null, "mode" to null))
        }

        AsyncFunction("injectTap") { char: String ->
            if (char.isEmpty()) throw IllegalArgumentException("char required")
            val ok = TapInputService.injectChar(if (char == "\\b") '\b' else char[0])
            if (!ok) throw IllegalStateException("TapInputService not running")
        }
    }
}
