package com.foverlay.tapinput

/**
 * Tapcode → character lookup for the standard Tap alphabet.
 *
 * A tapcode is a 5-bit finger bitmask (1–31). Bit order is the tap-android-sdk
 * convention: LSB (1) = thumb, bit 1 (2) = index, bit 2 (4) = middle,
 * bit 3 (8) = ring, bit 4 (16) = pinky. `repeat` is the SDK's repeatData from
 * onTapInputReceived: 1 = single tap, 2 = double, 3 = triple.
 *
 * The mapping is NOT invented here — it is transcribed from the official Tap
 * Alphabet Glossary published by Tap Systems:
 *   https://www.tapwithus.com/wp-content/uploads/2018/09/Tap-Alphabet-Glossary-2.pdf
 * Cross-checked against tapwithus.com "How Tap Works" (vowels = single fingers;
 * N = thumb+index, T = index+middle, L = middle+ring, S = ring+pinky) and the
 * support docs' o/x chord notation (Switch = ooxxx = 28, C = xoxxx = 29).
 *
 * Pure data, no Android dependencies — unit-testable on a plain JVM.
 */
object TapAlphabet {

    sealed class Result {
        /** A printable character: letters, space (' '), newline ('\n'), punctuation. */
        data class Text(val char: Char) : Result()
        object Backspace : Result()
        /** Shift chord — layer stub for the demo; state also arrives via onTapShiftSwitchReceived. */
        object Shift : Result()
        /** Switch chord — number/symbol layer stub for the demo. */
        object Switch : Result()
        data class Unmapped(val tapcode: Int, val repeat: Int) : Result()
    }

    /** Single-tap map (repeat == 1), tapcode 1..31. Index 0 unused. */
    private val singleTap: Array<Result?> = arrayOf(
        null,
        Result.Text('a'),   //  1: thumb
        Result.Text('e'),   //  2: index
        Result.Text('n'),   //  3: thumb+index
        Result.Text('i'),   //  4: middle
        Result.Text('d'),   //  5: thumb+middle
        Result.Text('t'),   //  6: index+middle
        Result.Shift,       //  7: thumb+index+middle
        Result.Text('o'),   //  8: ring
        Result.Text('k'),   //  9: thumb+ring
        Result.Text('m'),   // 10: index+ring
        Result.Text('f'),   // 11: thumb+index+ring
        Result.Text('l'),   // 12: middle+ring
        Result.Text('g'),   // 13: thumb+middle+ring
        Result.Backspace,   // 14: index+middle+ring
        Result.Text('r'),   // 15: thumb+index+middle+ring
        Result.Text('u'),   // 16: pinky
        Result.Text('y'),   // 17: thumb+pinky
        Result.Text('b'),   // 18: index+pinky
        Result.Text('p'),   // 19: thumb+index+pinky
        Result.Text('z'),   // 20: middle+pinky
        Result.Text('w'),   // 21: thumb+middle+pinky
        Result.Text('q'),   // 22: index+middle+pinky
        Result.Text('j'),   // 23: thumb+index+middle+pinky
        Result.Text('s'),   // 24: ring+pinky
        Result.Text('\n'),  // 25: thumb+ring+pinky (Enter)
        Result.Text('x'),   // 26: index+ring+pinky
        Result.Text('v'),   // 27: thumb+index+ring+pinky
        Result.Switch,      // 28: middle+ring+pinky
        Result.Text('c'),   // 29: thumb+middle+ring+pinky
        Result.Text('h'),   // 30: index+middle+ring+pinky
        Result.Text(' '),   // 31: all five (Space)
    )

    /**
     * Double-tap map (repeat == 2): the official single-finger letter shortcuts
     * plus the glossary's double-tap punctuation.
     */
    private val doubleTap: Map<Int, Result> = mapOf(
        1 to Result.Text('v'),    // thumb x2
        4 to Result.Text('j'),    // middle x2
        8 to Result.Text('q'),    // ring x2
        16 to Result.Text('w'),   // pinky x2
        17 to Result.Text('z'),   // thumb+pinky x2
        31 to Result.Text('.'),   // space chord x2
        10 to Result.Text(','),
        9 to Result.Text('?'),
        2 to Result.Text('!'),
        30 to Result.Text('-'),
        15 to Result.Text('\''),
    )

    /** Triple-tap map (repeat == 3). */
    private val tripleTap: Map<Int, Result> = mapOf(
        1 to Result.Text('@'),
        16 to Result.Text('_'),
    )

    fun decode(tapcode: Int, repeat: Int = 1): Result {
        if (tapcode < 1 || tapcode > 31) return Result.Unmapped(tapcode, repeat)
        return when (repeat) {
            1 -> singleTap[tapcode] ?: Result.Unmapped(tapcode, repeat)
            2 -> doubleTap[tapcode] ?: Result.Unmapped(tapcode, repeat)
            3 -> tripleTap[tapcode] ?: Result.Unmapped(tapcode, repeat)
            else -> Result.Unmapped(tapcode, repeat)
        }
    }

    data class Chord(val tapcode: Int, val repeat: Int)

    /**
     * Reverse lookup for FakeTapSource: character → the chord a Tap user would
     * type for it. Letters use their single-tap chords; '\b' means backspace.
     * Uppercase folds to lowercase (shift is stubbed in this demo). Returns
     * null for characters the base alphabet can't produce.
     */
    fun encode(char: Char): Chord? {
        val c = char.lowercaseChar()
        if (c == '\b') return Chord(14, 1)
        for (code in 1..31) {
            val r = singleTap[code]
            if (r is Result.Text && r.char == c) return Chord(code, 1)
        }
        for ((code, r) in doubleTap) {
            if (r is Result.Text && r.char == c) return Chord(code, 2)
        }
        for ((code, r) in tripleTap) {
            if (r is Result.Text && r.char == c) return Chord(code, 3)
        }
        return null
    }
}
