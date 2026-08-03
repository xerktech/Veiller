package com.foverlay.tapinput

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies TapAlphabet against the official Tap alphabet, cross-referenced from
 * Tap Systems' published material (see TapAlphabet.kt header for sources):
 *  - Vowels a/e/i/o/u are the five single fingers thumb→pinky.
 *  - tapwithus.com "How Tap Works": N = thumb+index, T = index+middle,
 *    L = middle+ring, S = ring+pinky; the word INTO = middle, thumb+index,
 *    index+middle, ring.
 *  - Support docs chord notation: Switch = ooxxx (28), C = xoxxx (29).
 *  - Commands: Space = all five (31), Backspace = index+middle+ring (14),
 *    Enter = thumb+ring+pinky (25), Shift = thumb+index+middle (7).
 */
class TapAlphabetTest {

    private fun char(tapcode: Int, repeat: Int = 1): Char {
        val result = TapAlphabet.decode(tapcode, repeat)
        assertTrue("tapcode=$tapcode repeat=$repeat should be Text, was $result", result is TapAlphabet.Result.Text)
        return (result as TapAlphabet.Result.Text).char
    }

    @Test
    fun vowelsAreSingleFingers() {
        assertEquals('a', char(1))   // thumb
        assertEquals('e', char(2))   // index
        assertEquals('i', char(4))   // middle
        assertEquals('o', char(8))   // ring
        assertEquals('u', char(16))  // pinky
    }

    @Test
    fun publishedTwoFingerExamples() {
        assertEquals('n', char(1 or 2))   // thumb+index
        assertEquals('t', char(2 or 4))   // index+middle
        assertEquals('l', char(4 or 8))   // middle+ring
        assertEquals('s', char(8 or 16))  // ring+pinky
    }

    @Test
    fun wordIntoFromOfficialDocs() {
        // INTO = middle / thumb+index / index+middle / ring
        val word = listOf(4, 3, 6, 8).map { char(it) }.joinToString("")
        assertEquals("into", word)
    }

    @Test
    fun commandChords() {
        assertEquals(' ', char(31))                                          // Space = all five
        assertEquals('\n', char(25))                                         // Enter
        assertTrue(TapAlphabet.decode(14) is TapAlphabet.Result.Backspace)   // index+middle+ring
        assertTrue(TapAlphabet.decode(7) is TapAlphabet.Result.Shift)        // thumb+index+middle
        assertTrue(TapAlphabet.decode(28) is TapAlphabet.Result.Switch)      // ooxxx
    }

    @Test
    fun switchAndCChordNotation() {
        // Support docs: "hit SWITCH (ooxxx) then C (xoxxx)" — o = tapped, thumb first.
        // ooxxx = thumb+index up... — in bitmask form Switch = 28, C = 29.
        assertTrue(TapAlphabet.decode(28) is TapAlphabet.Result.Switch)
        assertEquals('c', char(29))
    }

    @Test
    fun fullAlphabetIsCoveredExactlyOnce() {
        val letters = (1..31)
            .map { TapAlphabet.decode(it) }
            .filterIsInstance<TapAlphabet.Result.Text>()
            .map { it.char }
            .filter { it in 'a'..'z' }
        assertEquals("all 26 letters present in single-tap map", 26, letters.distinct().size)
        assertEquals("no letter appears twice", letters.size, letters.distinct().size)
    }

    @Test
    fun everyTapcodeDecodesToSomethingOnSingleTap() {
        for (code in 1..31) {
            val result = TapAlphabet.decode(code)
            assertTrue("tapcode=$code should be mapped", result !is TapAlphabet.Result.Unmapped)
        }
    }

    @Test
    fun doubleTapLetterShortcuts() {
        assertEquals('v', char(1, 2))
        assertEquals('j', char(4, 2))
        assertEquals('q', char(8, 2))
        assertEquals('w', char(16, 2))
        assertEquals('z', char(17, 2))
        assertEquals('.', char(31, 2))
    }

    @Test
    fun outOfRangeAndUnknownRepeatsAreUnmapped() {
        assertTrue(TapAlphabet.decode(0) is TapAlphabet.Result.Unmapped)
        assertTrue(TapAlphabet.decode(32) is TapAlphabet.Result.Unmapped)
        assertTrue(TapAlphabet.decode(3, 4) is TapAlphabet.Result.Unmapped)
        assertTrue(TapAlphabet.decode(3, 2) is TapAlphabet.Result.Unmapped) // 'n' has no double-tap meaning
    }

    @Test
    fun encodeRoundTripsTheBaseAlphabet() {
        for (c in 'a'..'z') {
            val chord = TapAlphabet.encode(c)
            assertTrue("no chord for '$c'", chord != null)
            val decoded = TapAlphabet.decode(chord!!.tapcode, chord.repeat)
            assertEquals(TapAlphabet.Result.Text(c), decoded)
        }
        assertEquals(TapAlphabet.Chord(31, 1), TapAlphabet.encode(' '))
        assertEquals(TapAlphabet.Chord(14, 1), TapAlphabet.encode('\b'))
        assertEquals(TapAlphabet.Chord(25, 1), TapAlphabet.encode('\n'))
    }

    @Test
    fun encodePrefersSingleTapChordsForLetters() {
        // v/j/q/w/z have both a 4-finger single-tap chord and an x2 shortcut;
        // encode() must produce the single-tap form.
        assertEquals(TapAlphabet.Chord(27, 1), TapAlphabet.encode('v'))
        assertEquals(TapAlphabet.Chord(23, 1), TapAlphabet.encode('j'))
        assertEquals(TapAlphabet.Chord(22, 1), TapAlphabet.encode('q'))
        assertEquals(TapAlphabet.Chord(21, 1), TapAlphabet.encode('w'))
        assertEquals(TapAlphabet.Chord(20, 1), TapAlphabet.encode('z'))
    }

    @Test
    fun encodeFoldsUppercaseAndRejectsUnknown() {
        assertEquals(TapAlphabet.encode('a'), TapAlphabet.encode('A'))
        assertNull(TapAlphabet.encode('~'))
        assertNull(TapAlphabet.encode('7'))
    }
}
