package com.foverlay.tapinput

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo module bridging TapInputService's decoded tap events into React Native.
 *
 * Event payloads mirror what the miniapp runtime forwards on the "tap_input"
 * stream (see @mentra/engine DeviceEventRouter):
 *
 *   tap_input: {
 *     char: string | null   // printable char (" " space, "\n" enter) or null
 *     action: "char" | "backspace" | "shift" | "switch" | "unmapped"
 *     tapcode: number       // raw 5-bit finger bitmask, 1–31
 *     repeat: number        // 1 = single tap, 2 = double, 3 = triple
 *     timestamp: number     // wall-clock ms at the native SDK callback
 *     source: "real" | "fake"
 *   }
 *
 *   tap_status: { status: "connecting"|"connected"|"disconnected"|"error"|"bluetooth_off",
 *                 tapIdentifier: string | null }
 */
class TapInputModule : Module() {

    companion object {
        private const val TAG = "FoverlayTapModule"
        const val EVENT_TAP_INPUT = "tap_input"
        const val EVENT_TAP_STATUS = "tap_status"

        @Volatile
        private var instance: TapInputModule? = null

        fun emitTap(
            result: TapAlphabet.Result,
            tapcode: Int,
            repeat: Int,
            timestampMs: Long,
            source: String,
        ) {
            val module = instance
            if (module == null) {
                // Service can outlive the RN context (START_STICKY restart
                // before the app process re-registers). Drop, don't crash.
                Log.w(TAG, "tap_input dropped — JS bridge not attached (tapcode=$tapcode)")
                return
            }
            val (char: String?, action: String) = when (result) {
                is TapAlphabet.Result.Text -> result.char.toString() to "char"
                is TapAlphabet.Result.Backspace -> null to "backspace"
                is TapAlphabet.Result.Shift -> null to "shift"
                is TapAlphabet.Result.Switch -> null to "switch"
                is TapAlphabet.Result.Unmapped -> null to "unmapped"
            }
            module.sendEvent(
                EVENT_TAP_INPUT,
                mapOf(
                    "char" to char,
                    "action" to action,
                    "tapcode" to tapcode,
                    "repeat" to repeat,
                    "timestamp" to timestampMs,
                    "source" to source,
                ),
            )
        }

        fun emitStatus(status: String, tapIdentifier: String?) {
            instance?.sendEvent(
                EVENT_TAP_STATUS,
                mapOf("status" to status, "tapIdentifier" to tapIdentifier),
            )
        }
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
    }
}
