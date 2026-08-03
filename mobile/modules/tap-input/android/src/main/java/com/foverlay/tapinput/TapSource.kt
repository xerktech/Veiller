package com.foverlay.tapinput

/**
 * A source of decoded tap events. Two implementations:
 *  - RealTapSource: tap-android-sdk in Controller Mode (real Tap Strap 2)
 *  - FakeTapSource: adb-broadcast-driven emulation for development without hardware
 *
 * Both run at once inside TapInputService and feed the same sink; the fake
 * source only produces events when explicitly driven via adb, so coexistence
 * is harmless and means no rebuild is needed when the hardware shows up.
 */
interface TapSource {
    fun start()
    fun stop()
}

/**
 * Sink for decoded tap events.
 *
 * @param result       decoded chord (character / backspace / layer chord / unmapped)
 * @param tapcode      raw 5-bit finger bitmask (1–31)
 * @param repeat       1 = single tap, 2 = double, 3 = triple
 * @param timestampMs  wall-clock ms at the moment the SDK callback (or fake
 *                     emission) fired — the start anchor for keystroke→display
 *                     latency measurement
 * @param source       "real" or "fake"
 */
typealias TapSink = (
    result: TapAlphabet.Result,
    tapcode: Int,
    repeat: Int,
    timestampMs: Long,
    source: String,
) -> Unit
