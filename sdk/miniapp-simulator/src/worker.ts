/**
 * The emulated per-miniapp JSContext.
 *
 * On a phone each miniapp's background bundle runs in its own JS engine
 * (JavaScriptCore on iOS, QuickJS/Zipline on Android) with no DOM and no module
 * loader. The VeillerJS polyfill installs a handful of globals on top of a
 * single `__dispatch(iface, method, argsJson)` native bridge, the host
 * evaluates the bundle as a classic script, and then delivers one
 * `{kind:"init"}` envelope which the polyfill turns into
 * `__veillerInitCallback(sessionId)`.
 *
 * A Worker reproduces that shape closely: separate realm, separate globals, its
 * own timer queue, and a message channel standing in for the native bridge. The
 * globals the polyfill would provide over `__dispatch` (fetch, WebSocket,
 * timers, console, crypto, atob/btoa) already exist natively here, so only the
 * bridge itself is emulated.
 *
 * Wire (worker → host):
 *   {t:"loaded"}                    bundle evaluated without throwing
 *   {t:"bridge", raw}               a `__dispatch("__bridge","send",[raw])` call
 *   {t:"log", level, text}          console.* from miniapp code
 *   {t:"error", message, stack}     uncaught error / `__hostError`
 * Wire (host → worker):
 *   {t:"init", sessionId}           run the registered miniapp handler
 *   {t:"bridge", raw}               inbound envelope for the SDK's transport
 */

/** The worker global, as the DOM lib does not describe Bun's worker scope. */
const worker = globalThis as unknown as {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage: (data: unknown) => void
}

interface BridgeGlobals {
  __dispatch?: (iface: string, method: string, argsJson: string) => string | null
  __hostError?: (payloadJson: string) => void
  [key: string]: unknown
}

const g = globalThis as unknown as BridgeGlobals

// ---------- pre-rename bundle ABI (XERK-229) --------------------------------
// Bundles published before the Veiller rename spell every bridge global
// `__mentra*` instead of `__veiller*`, and they are immutable release
// artifacts. The real polyfill installs its globals under both names and reads
// miniapp-installed hooks under either; the simulator does the same, or a
// legacy bundle would evaluate fine and then never receive its init callback.
const legacyName = (name: string): string => name.replace(/^__veiller/, "__mentra")

function installHostGlobal(name: string, value: unknown): void {
  g[name] = value
  g[legacyName(name)] = value
}

function readMiniappHook<T>(name: string): T | undefined {
  return (g[name] ?? g[legacyName(name)]) as T | undefined
}

g.__dispatch = (iface: string, method: string, argsJson: string): string | null => {
  if (iface === "__bridge" && method === "send") {
    try {
      const [raw] = JSON.parse(argsJson) as [string]
      worker.postMessage({t: "bridge", raw})
    } catch (err) {
      worker.postMessage({t: "error", message: `__dispatch send: ${String(err)}`, stack: ""})
    }
    return null
  }
  // Anything else would be a polyfill-provided capability (fetch/WebSocket/…)
  // that this realm already has natively. Report rather than silently no-op.
  worker.postMessage({t: "error", message: `unhandled __dispatch("${iface}","${method}")`, stack: ""})
  return null
}

g.__hostError = (payloadJson: string) => {
  try {
    const parsed = JSON.parse(payloadJson) as {message?: string; stack?: string}
    worker.postMessage({t: "error", message: parsed.message ?? payloadJson, stack: parsed.stack ?? ""})
  } catch {
    worker.postMessage({t: "error", message: payloadJson, stack: ""})
  }
}

// Console tap — miniapp logs are a first-class debugging surface, so forward
// them to the host instead of letting them scatter into the worker's stdout.
for (const level of ["log", "info", "warn", "error", "debug"] as const) {
  const original = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    original(...args)
    worker.postMessage({t: "log", level, text: args.map(formatArg).join(" ")})
  }
}

function formatArg(a: unknown): string {
  if (typeof a === "string") return a
  if (a instanceof Error) return `${a.name}: ${a.message}`
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

worker.onmessage = (event: MessageEvent) => {
  const msg = event.data as {t?: string; raw?: string; sessionId?: string; code?: string}
  if (msg?.t === "bridge" && typeof msg.raw === "string") {
    const deliver = readMiniappHook<(raw: string) => void>("__veillerDeliverBridgeRaw")
    if (typeof deliver === "function") deliver(msg.raw)
    return
  }
  if (msg?.t === "init") {
    const sessionId = msg.sessionId ?? "sim-session"
    installHostGlobal("__veillerSessionId", sessionId)
    const initCb = readMiniappHook<(sid: string) => void>("__veillerInitCallback")
    if (typeof initCb !== "function") {
      worker.postMessage({
        t: "error",
        message:
          "bundle did not call registerMiniapp() — no __veillerInitCallback (or legacy __mentraInitCallback) on globalThis after evaluation",
        stack: "",
      })
      return
    }
    initCb(sessionId)
    return
  }
  if (msg?.t === "eval" && typeof msg.code === "string") {
    // Indirect eval so the bundle sees global scope, the way JSC/QuickJS
    // evaluate a classic script. `new Function` would hide its top-level
    // `var`s and `function` declarations from globalThis.
    try {
      ;(0, eval)(msg.code)
      worker.postMessage({t: "loaded"})
    } catch (err) {
      worker.postMessage({
        t: "error",
        message: `bundle evaluation threw: ${err instanceof Error ? err.message : String(err)}`,
        stack: err instanceof Error ? (err.stack ?? "") : "",
      })
    }
  }
}

worker.postMessage({t: "ready"})
