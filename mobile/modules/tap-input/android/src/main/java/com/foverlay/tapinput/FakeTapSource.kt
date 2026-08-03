package com.foverlay.tapinput

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Development stand-in for the Tap Strap 2, driven over adb so the full
 * chain (native → bridge → miniapp → G2 display) is testable with no
 * hardware in hand:
 *
 *   # one chord, by raw tapcode (3 = thumb+index = 'n')
 *   adb shell am broadcast -a com.foverlay.tapinput.FAKE_TAP --ei tapcode 3
 *
 *   # one character (reverse-mapped through TapAlphabet)
 *   adb shell am broadcast -a com.foverlay.tapinput.FAKE_TAP --es char x
 *
 *   # stream text at a typing pace, to exercise the render throttle
 *   adb shell am broadcast -a com.foverlay.tapinput.FAKE_TAP --es text 'hello world' --ei wpm 40
 *
 *   # backspace
 *   adb shell am broadcast -a com.foverlay.tapinput.FAKE_TAP --es char '\b'
 *
 * Registered dynamically (RECEIVER_EXPORTED so adb's shell uid can reach it)
 * for the lifetime of TapInputService.
 */
class FakeTapSource(
    private val context: Context,
    private val sink: TapSink,
) : TapSource {

    companion object {
        private const val TAG = "FoverlayTapFake"
        const val ACTION_FAKE_TAP = "com.foverlay.tapinput.FAKE_TAP"
        const val EXTRA_TAPCODE = "tapcode"
        const val EXTRA_REPEAT = "repeat"
        const val EXTRA_CHAR = "char"
        const val EXTRA_TEXT = "text"
        const val EXTRA_WPM = "wpm"
        private const val DEFAULT_WPM = 40
    }

    private val handler = Handler(Looper.getMainLooper())
    private var registered = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.action != ACTION_FAKE_TAP) return

            val tapcode = intent.getIntExtra(EXTRA_TAPCODE, -1)
            if (tapcode in 1..31) {
                val repeat = intent.getIntExtra(EXTRA_REPEAT, 1)
                emitTapcode(tapcode, repeat)
                return
            }

            val char = intent.getStringExtra(EXTRA_CHAR)
            if (!char.isNullOrEmpty()) {
                // Allow the literal two-character escape "\b" from the shell.
                val c = if (char == "\\b") '\b' else char[0]
                emitChar(c)
                return
            }

            val text = intent.getStringExtra(EXTRA_TEXT)
            if (!text.isNullOrEmpty()) {
                val wpm = intent.getIntExtra(EXTRA_WPM, DEFAULT_WPM)
                streamText(text, wpm)
                return
            }

            Log.w(TAG, "FAKE_TAP broadcast with no usable extra (want tapcode/char/text)")
        }
    }

    override fun start() {
        if (registered) return
        val filter = IntentFilter(ACTION_FAKE_TAP)
        // Exported so `adb shell am broadcast` (shell uid) can trigger it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }
        registered = true
        Log.i(TAG, "FakeTapSource listening for $ACTION_FAKE_TAP broadcasts")
    }

    override fun stop() {
        if (!registered) return
        registered = false
        handler.removeCallbacksAndMessages(null)
        try {
            context.unregisterReceiver(receiver)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "Receiver already unregistered", e)
        }
    }

    private fun emitTapcode(tapcode: Int, repeat: Int) {
        val result = TapAlphabet.decode(tapcode, repeat)
        sink(result, tapcode, repeat, System.currentTimeMillis(), "fake")
    }

    private fun emitChar(c: Char) {
        val chord = TapAlphabet.encode(c)
        if (chord == null) {
            Log.w(TAG, "No Tap chord for char '$c' — skipped")
            return
        }
        emitTapcode(chord.tapcode, chord.repeat)
    }

    /**
     * Emit characters on a timer at a typing pace. WPM uses the standard
     * 5-chars-per-word convention, so 40 WPM = 200 chars/min = one character
     * every 300 ms — realistic load for validating the display throttle.
     */
    private fun streamText(text: String, wpm: Int) {
        val safeWpm = wpm.coerceIn(1, 400)
        val intervalMs = 60_000L / (safeWpm * 5L)
        Log.i(TAG, "Streaming ${text.length} chars at $safeWpm WPM (${intervalMs}ms/char)")
        text.forEachIndexed { i, c ->
            handler.postDelayed({ emitChar(c) }, i * intervalMs)
        }
    }
}
