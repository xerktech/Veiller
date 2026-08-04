/**
 * Foverlay: Tap Strap 2 status card for the home screen.
 *
 * Live view of the whole tap→glasses pipeline so debugging doesn't require
 * adb: strap connection + input mode (from the native tap-input module),
 * chord counters with the last decoded chord, and the echo service's render
 * outcomes — including whether LocalDisplayManager accepted or blocked the
 * last display request. "Send test tap" injects a character through the
 * exact same pipeline real chords use, isolating phone→glasses problems
 * from strap→phone ones.
 */
import {useCallback, useEffect, useState} from "react"
import {TouchableOpacity, View} from "react-native"

import GlassView from "@/components/ui/GlassView"
import {Text} from "@/components/ignite"
import {
  addTapInputListener,
  addTapStatusListener,
  getTapStatus,
  injectTestTap,
  isTapInputAvailable,
  type TapStatusSnapshot,
} from "@foverlay/tap-input"
import {getTapEchoDebugState, subscribeTapEchoDebug, type TapEchoDebugState} from "@mentra/engine/internal"

const TEST_CHARS = "test "

function describeChord(chord: TapStatusSnapshot["lastChord"]): string {
  if (!chord) return "none yet"
  const fingers = ["thumb", "index", "middle", "ring", "pinky"]
    .filter((_, i) => (chord.tapcode & (1 << i)) !== 0)
    .join("+")
  const what =
    chord.action === "char"
      ? `"${chord.char === " " ? "space" : chord.char === "\n" ? "enter" : chord.char}"`
      : chord.action
  const repeat = chord.repeat > 1 ? ` ×${chord.repeat}` : ""
  return `${what} (${fingers}${repeat}, ${chord.source})`
}

export const TapStrapStatusCard = () => {
  const [snapshot, setSnapshot] = useState<TapStatusSnapshot | null>(() => getTapStatus())
  const [echo, setEcho] = useState<TapEchoDebugState>(() => getTapEchoDebugState())
  const [testIndex, setTestIndex] = useState(0)

  useEffect(() => {
    if (!isTapInputAvailable) return
    const refresh = () => setSnapshot(getTapStatus())
    const inputSub = addTapInputListener(refresh)
    const statusSub = addTapStatusListener(refresh)
    const echoUnsub = subscribeTapEchoDebug(() => setEcho(getTapEchoDebugState()))
    return () => {
      inputSub?.remove()
      statusSub?.remove()
      echoUnsub()
    }
  }, [])

  const sendTestTap = useCallback(() => {
    const char = TEST_CHARS[testIndex % TEST_CHARS.length]
    setTestIndex((i) => i + 1)
    void injectTestTap(char).catch((error) => console.warn("TapStrapStatusCard: test tap failed", error))
  }, [testIndex])

  if (!isTapInputAvailable) return null

  const taps = snapshot?.taps ?? []
  const bonded = snapshot?.bondedTaps ?? []
  let strapLine: string
  if (taps.length > 0) {
    strapLine = taps.map((t) => `Connected — mode: ${t.mode}`).join("\n")
  } else if (!snapshot?.serviceRunning) {
    strapLine = "Tap service not running"
  } else if (snapshot.realSource === "no_permission") {
    strapLine = "Bluetooth permission missing — grant Nearby devices to Foverlay"
  } else if (snapshot.realSource === "failed") {
    strapLine = "Tap SDK failed to start (see logcat FoverlayTapService)"
  } else if (bonded.length === 0) {
    strapLine = "No Tap paired — pair the strap in Android Bluetooth settings"
  } else {
    strapLine = `Paired: ${bonded.join(", ")} — connecting… (auto-retries every 20s)`
  }

  return (
    <GlassView className="px-6 py-4 rounded-2xl">
      <View className="flex-row justify-between items-center">
        <Text className="text-lg font-bold">Tap Strap</Text>
        <TouchableOpacity onPress={sendTestTap} className="px-3 py-1.5 rounded-lg bg-secondary">
          <Text className="text-sm font-medium">Send test tap</Text>
        </TouchableOpacity>
      </View>
      <View className="mt-2 gap-1">
        <Text className="text-sm">{strapLine}</Text>
        <Text className="text-sm text-secondary_foreground">
          Chords: {snapshot?.tapCount ?? 0} · last: {describeChord(snapshot?.lastChord ?? null)}
        </Text>
        <Text className="text-sm text-secondary_foreground">
          Echo: {echo.running ? "running" : "stopped"} · seen {echo.tapsSeen} · renders {echo.renders}
          {echo.lastLatencyMs != null ? ` · ${echo.lastLatencyMs}ms` : ""}
        </Text>
        <Text className="text-sm text-secondary_foreground">Last render: {echo.lastRenderResult ?? "none yet"}</Text>
        {echo.buffer.length > 0 && (
          <Text className="text-sm text-secondary_foreground" numberOfLines={1}>
            Buffer: {echo.buffer.slice(-40)}
          </Text>
        )}
      </View>
    </GlassView>
  )
}
