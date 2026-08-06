import {useCallback, useEffect, useRef, useState} from "react"
import {ScrollView, TextInput, View} from "react-native"

import {Header, Screen, Text} from "@/components/ignite"
import {Group} from "@/components/ui/Group"
import {useAppTheme} from "@/contexts/ThemeContext"
import {useEngineSnapshot} from "@/hooks/useEngineSnapshot"
import {translate} from "@/i18n"
import {useNavigationStore} from "@/stores/navigation"
import {diffEdit} from "@/utils/taptester/diffEdit"
import {engine, SETTINGS, useSetting} from "@veiller/engine"

// Where the mirrored text is drawn on the glasses. The tester writes raw text
// (same escape-hatch path the Nex dev tools use) rather than going through the
// layout system, since the point is to confirm keystrokes reach the display.
const DISPLAY_X = 0
const DISPLAY_Y = 0
const DISPLAY_SIZE = 30

// Keep the on-screen log bounded so a long typing session never grows unbounded.
const MAX_LOG_ENTRIES = 200

type LogKind = "key" | "display" | "status" | "info" | "error"

interface LogEntry {
  id: number
  ts: string
  kind: LogKind
  message: string
}

const LOG_COLORS: Record<LogKind, string> = {
  key: "text-secondary-foreground",
  display: "text-secondary-foreground",
  status: "text-secondary-foreground",
  info: "text-muted-foreground",
  error: "text-red-500",
}

function formatTime(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

export default function TapTesterScreen() {
  const {goBack} = useNavigationStore.getState()
  const {theme} = useAppTheme()

  const [text, setText] = useState("")
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [wasTakeoverOn, setWasTakeoverOn] = useState(false)
  const logIdRef = useRef(0)

  const tapStatus = useEngineSnapshot(engine.tapStrap.status, (onChange) => engine.tapStrap.onStatus(onChange))
  const glassesConnected =
    useEngineSnapshot(engine.glasses.status, (onChange) => engine.glasses.onStatus(onChange)).state === "connected"
  const [takeover] = useSetting<boolean>(SETTINGS.tap_strap_takeover.key)

  // Latest glasses-connection flag for the coalesced writer, which reads it
  // outside React's render (avoids a stale closure without re-creating the
  // write callback on every connection change).
  const glassesConnectedRef = useRef(glassesConnected)
  glassesConnectedRef.current = glassesConnected

  const addLog = useCallback((kind: LogKind, message: string) => {
    const entry: LogEntry = {id: logIdRef.current++, ts: formatTime(new Date()), kind, message}
    setLogs((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES))
  }, [])

  // Coalesced glasses writes: the strap types a character at a time, so guard a
  // single in-flight BLE write and re-flush the latest text once it lands rather
  // than queueing a write per keystroke.
  const inFlightRef = useRef(false)
  const pendingRef = useRef<string | null>(null)

  const flushToGlasses = useCallback(async () => {
    if (inFlightRef.current) return
    const next = pendingRef.current
    if (next === null) return
    // Nothing to draw on: keep the phone-side text/log working, skip BLE writes
    // (and the per-keystroke errors they'd raise) until glasses reconnect.
    if (!glassesConnectedRef.current) {
      pendingRef.current = null
      return
    }
    pendingRef.current = null
    inFlightRef.current = true
    try {
      if (next.length === 0) {
        await engine.display.clear()
        addLog("display", "→ glasses cleared")
      } else {
        await engine.display.text(next, DISPLAY_X, DISPLAY_Y, DISPLAY_SIZE)
        const shown = next.length > 40 ? `${next.slice(0, 40)}…` : next
        addLog("display", `→ glasses ${JSON.stringify(shown)}`)
      }
    } catch (error) {
      addLog("error", `Glasses write failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      inFlightRef.current = false
      if (pendingRef.current !== null) void flushToGlasses()
    }
  }, [addLog])

  const queueToGlasses = useCallback(
    (value: string) => {
      pendingRef.current = value
      void flushToGlasses()
    },
    [flushToGlasses],
  )

  const handleChangeText = useCallback(
    (next: string) => {
      const {removed, added} = diffEdit(text, next)
      if (removed) addLog("key", `− removed ${JSON.stringify(removed)}`)
      if (added) addLog("key", `+ typed ${JSON.stringify(added)}`)
      setText(next)
      queueToGlasses(next)
    },
    [text, addLog, queueToGlasses],
  )

  const handleClear = useCallback(() => {
    setText("")
    queueToGlasses("")
    addLog("info", "Cleared text and glasses display")
  }, [queueToGlasses, addLog])

  // On entry: if controller-mode takeover is on the strap won't emit keystrokes,
  // so disable it and restore on exit. Also refresh the native status snapshot
  // (pairing happens in the phone's Bluetooth settings) and clear the display on
  // the way out so the test text doesn't linger.
  const restoreTakeoverRef = useRef(false)
  useEffect(() => {
    void (async () => {
      const on = !!engine.settings.get(SETTINGS.tap_strap_takeover.key)
      if (on) {
        restoreTakeoverRef.current = true
        setWasTakeoverOn(true)
        try {
          await engine.tapStrap.setTakeover(false)
          addLog("info", "Disabled controller mode so taps type as a keyboard")
        } catch (error) {
          addLog(
            "error",
            `Could not disable controller mode: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
      await engine.tapStrap.refresh().catch(() => {})
    })()
    return () => {
      if (restoreTakeoverRef.current) engine.tapStrap.setTakeover(true).catch(() => {})
      engine.display.clear().catch(() => {})
    }
    // Run once on mount/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Log tap connect/disconnect and battery changes as they arrive.
  const prevTapsRef = useRef<Record<string, {connected: boolean; battery?: number}>>({})
  useEffect(() => {
    const prev = prevTapsRef.current
    const nextMap: Record<string, {connected: boolean; battery?: number}> = {}
    for (const tap of tapStatus.taps) {
      const key = tap.address || tap.name
      nextMap[key] = {connected: tap.connected, battery: tap.battery}
      const before = prev[key]
      if (before && before.connected !== tap.connected) {
        addLog("status", `${tap.name} ${tap.connected ? "connected" : "disconnected"}`)
      }
      if (before && before.battery !== tap.battery && tap.battery !== undefined && tap.battery >= 0) {
        addLog("status", `${tap.name} battery ${tap.battery}%`)
      }
    }
    prevTapsRef.current = nextMap
  }, [tapStatus, addLog])

  // Push the current text once the glasses (re)connect so the display catches up
  // to whatever was typed while they were offline.
  useEffect(() => {
    if (glassesConnected && text.length > 0) queueToGlasses(text)
    // Only react to the connection flip, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glassesConnected])

  const yesNo = (value: boolean) => (value ? translate("tapTester:yes") : translate("tapTester:no"))

  return (
    <Screen preset="fixed">
      <Header
        title={translate("tapTester:title")}
        leftIcon="chevron-left"
        onLeftPress={goBack}
        rightText={translate("tapTester:clear")}
        onRightPress={handleClear}
      />
      <ScrollView
        style={{marginHorizontal: -theme.spacing.s4, paddingHorizontal: theme.spacing.s4}}
        keyboardShouldPersistTaps="handled">
        <View className="flex flex-col gap-6 pt-6 pb-10">
          {/* The empty text box you type into with Tap gestures. */}
          <View>
            <TextInput
              autoFocus
              multiline
              value={text}
              onChangeText={handleChangeText}
              placeholder={translate("tapTester:inputPlaceholder")}
              placeholderTextColor={theme.colors.muted_foreground}
              autoCorrect={false}
              autoCapitalize="none"
              style={{
                minHeight: 120,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 12,
                padding: 16,
                fontSize: 18,
                color: theme.colors.foreground,
                backgroundColor: theme.colors.muted,
                textAlignVertical: "top",
              }}
            />
            <Text className="text-muted-foreground text-sm mt-2" text={translate("tapTester:inputHint")} />
          </View>

          {wasTakeoverOn && (
            <Text className="text-muted-foreground text-sm" text={translate("tapTester:controllerModeOnNote")} />
          )}

          {/* Troubleshooting: live status snapshot. */}
          <Group title={translate("tapTester:status")}>
            <StatusRow label={translate("tapTester:supported")} value={yesNo(tapStatus.supported)} />
            <StatusRow
              label={translate("tapTester:bluetoothPermission")}
              value={yesNo(tapStatus.bluetoothPermission)}
            />
            <StatusRow
              label={translate("tapTester:pairedStraps")}
              value={
                tapStatus.taps.length === 0
                  ? translate("tapTester:none")
                  : tapStatus.taps
                      .map((tap) => {
                        const conn = tap.connected
                          ? translate("tapTester:connected")
                          : translate("tapTester:disconnected")
                        const batt =
                          tap.battery !== undefined && tap.battery >= 0
                            ? `, ${tap.battery}% ${translate("tapTester:battery")}`
                            : ""
                        return `${tap.name} (${conn}${batt})`
                      })
                      .join("\n")
              }
            />
            <StatusRow label={translate("tapTester:controllerMode")} value={yesNo(!!takeover)} />
            <StatusRow
              label={translate("tapTester:glassesDisplay")}
              value={glassesConnected ? translate("tapTester:connected") : translate("tapTester:disconnected")}
            />
          </Group>

          {/* Troubleshooting: live event log. */}
          <Group title={translate("tapTester:eventLog")}>
            <View className="flex-row justify-end -mt-2 mb-1">
              <Text
                className="text-muted-foreground text-sm"
                text={translate("tapTester:clearLog")}
                onPress={() => setLogs([])}
              />
            </View>
            {logs.length === 0 ? (
              <Text className="text-muted-foreground text-sm py-2" text={translate("tapTester:noEvents")} />
            ) : (
              <View className="flex flex-col gap-1 py-1">
                {logs.map((entry) => (
                  <View key={entry.id} className="flex-row gap-2">
                    <Text
                      className="text-muted-foreground text-xs"
                      style={{fontVariant: ["tabular-nums"]}}
                      text={entry.ts}
                    />
                    <Text className={`${LOG_COLORS[entry.kind]} text-xs flex-1`} text={entry.message} />
                  </View>
                ))}
              </View>
            )}
          </Group>
        </View>
      </ScrollView>
    </Screen>
  )
}

function StatusRow({label, value}: {label: string; value: string}) {
  return (
    <View className="flex-row justify-between items-start py-2 gap-4">
      <Text className="text-muted-foreground text-base shrink-0" text={label} />
      <Text className="text-secondary-foreground text-base flex-1 text-right" text={value} />
    </View>
  )
}
