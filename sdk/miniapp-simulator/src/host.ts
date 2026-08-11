/**
 * SimulatorHost — the phone, as far as a miniapp can tell.
 *
 * Speaks the same wire protocol `LocalMiniappRuntime` speaks: CONNECT →
 * CONNECT_ACK, subscription-gated EVENT fan-out, correlated REQUEST_RESULTs,
 * and the `_ui` bus that joins the background context to its WebView. Display
 * requests go through {@link VirtualGlasses}, which runs the app's real scene
 * pipeline, so what the lens shows here is what the glasses would show.
 *
 * Requests with no simulator implementation are answered with an explicit
 * NOT_IMPLEMENTED error and logged — the same failure a miniapp would see from
 * a host that doesn't support the call, rather than a synthetic success that
 * hides the gap.
 */

import {
  MiniappErrorCode,
  MiniappRequestType,
  MiniappResponseType,
} from "../../../mobile/modules/miniapp/src/protocol"
import type {SceneElementInput} from "../../../mobile/modules/engine/src/utils/display/scene/index"
import type {SceneView, VirtualGlasses} from "./glasses"
import type {MiniappManifest} from "./bundle"

export interface HostEvent {
  streamType: string
  data: unknown
}

/** One line in the simulator's unified timeline (miniapp logs + host traffic). */
export interface TraceEntry {
  at: number
  kind: "log" | "request" | "event" | "render" | "ui" | "error"
  text: string
  detail?: unknown
}

export interface SimulatorHostOptions {
  manifest: MiniappManifest
  glasses: VirtualGlasses
  userId?: string
  /** Seed values for `session.storage`. */
  storage?: Record<string, string>
  onTrace?: (entry: TraceEntry) => void
}

type Outbound = (raw: string) => void

const MANIFEST_PERMISSION_MAP: Record<string, string> = {
  MICROPHONE: "microphone",
  CAMERA: "camera",
  LOCATION: "location",
  BACKGROUND_LOCATION: "location",
  READ_NOTIFICATIONS: "notifications",
  POST_NOTIFICATIONS: "notifications",
  CALENDAR: "calendar",
}

export class SimulatorHost {
  private send: Outbound = () => {}
  private readonly opts: SimulatorHostOptions
  private readonly glasses: VirtualGlasses
  private readonly storage = new Map<string, string>()
  /** Streams the miniapp is currently subscribed to (bare wire names). */
  private subscriptions = new Set<string>()
  private uiBound = false
  private uiSendListeners = new Set<(env: Record<string, unknown>) => void>()
  private traceListeners = new Set<(entry: TraceEntry) => void>()

  public connected = false
  public visibility: "foreground" | "background" = "foreground"
  public readonly trace: TraceEntry[] = []
  /** Requests the simulator was asked for but does not implement. */
  public readonly unimplemented: string[] = []
  /**
   * Requests the simulator answers successfully without simulating anything.
   * Distinct from `unimplemented`, which is answered with NOT_IMPLEMENTED —
   * these look like successes to the miniapp, so they need surfacing too.
   */
  public readonly stubbed: string[] = []

  constructor(opts: SimulatorHostOptions) {
    this.opts = opts
    this.glasses = opts.glasses
    for (const [k, v] of Object.entries(opts.storage ?? {})) this.storage.set(k, v)
  }

  get packageName(): string {
    return this.opts.manifest.packageName
  }

  /** Wire the outbound half — everything the host pushes into the JSContext. */
  attach(send: Outbound): void {
    this.send = send
  }

  // ===========================================================================
  // Inbound: miniapp → host
  // ===========================================================================

  handleRaw(raw: string): void {
    let envelope: {payload?: Record<string, unknown>; requestId?: string}
    try {
      envelope = JSON.parse(raw)
    } catch {
      this.log("error", `unparseable envelope from miniapp: ${raw.slice(0, 120)}`)
      return
    }
    const payload = envelope.payload
    if (!payload || typeof payload !== "object") return
    const type = payload.type as string | undefined
    const requestId = envelope.requestId

    // The UI bus rides ordinary one-shot frames; intercept before the
    // request table, exactly as VeillerJSRouter does.
    if (type === "UI_SEND" || type === "UI_CANCEL") {
      this.routeUiSend(payload)
      return
    }

    if (type === MiniappResponseType.PONG) return

    void this.dispatch(type, payload, requestId)
  }

  private async dispatch(
    type: string | undefined,
    payload: Record<string, unknown>,
    requestId?: string,
  ): Promise<void> {
    switch (type) {
      case MiniappRequestType.CONNECT:
        this.handleConnect()
        return

      case MiniappRequestType.SUBSCRIBE: {
        const subs = (payload.subscriptions as unknown[]) ?? []
        this.subscriptions = new Set(
          subs.map((s) => (typeof s === "string" ? s : String((s as {stream?: string})?.stream ?? ""))),
        )
        this.log("event", `subscriptions: ${[...this.subscriptions].join(", ") || "(none)"}`)
        return
      }

      case MiniappRequestType.RENDER: {
        const view = (payload.view as SceneView | undefined) ?? "main"
        const elements = (payload.elements as SceneElementInput[]) ?? []
        const outcome = this.glasses.render(this.packageName, view, elements)
        this.log(
          "render",
          `render(${elements.length} element${elements.length === 1 ? "" : "s"}) → ${outcome.frame ? describeFrame(outcome.frame.elements.map((e) => e.change), outcome.frame.removed.length) : "no display"}`,
          outcome,
        )
        this.reply(requestId, {
          status: "displayed",
          degraded: outcome.degraded,
          dropped: outcome.dropped,
        })
        return
      }

      case MiniappRequestType.DISPLAY: {
        // Legacy layout wire shape, still accepted from bundles packed with
        // older SDKs. Nothing first-party emits it; log so it's visible.
        this.log("render", `legacy display(${JSON.stringify(payload.layout).slice(0, 120)})`)
        this.reply(requestId, {status: "displayed"})
        return
      }

      case MiniappRequestType.STORAGE_GET:
        this.reply(requestId, {value: this.storage.get(String(payload.key)) ?? null})
        return
      case MiniappRequestType.STORAGE_SET:
        this.storage.set(String(payload.key), String(payload.value))
        this.reply(requestId, {ok: true})
        return
      case MiniappRequestType.STORAGE_DELETE:
        this.storage.delete(String(payload.key))
        this.reply(requestId, {ok: true})
        return
      case MiniappRequestType.STORAGE_HAS:
        this.reply(requestId, {value: this.storage.has(String(payload.key))})
        return
      case MiniappRequestType.STORAGE_LIST:
        this.reply(requestId, {keys: [...this.storage.keys()]})
        return
      case MiniappRequestType.STORAGE_GET_ALL:
        this.reply(requestId, {values: Object.fromEntries(this.storage)})
        return
      case MiniappRequestType.STORAGE_SET_MULTIPLE: {
        const values = (payload.values as Record<string, string>) ?? {}
        for (const [k, v] of Object.entries(values)) this.storage.set(k, String(v))
        this.reply(requestId, {ok: true})
        return
      }
      case MiniappRequestType.STORAGE_CLEAR:
        this.storage.clear()
        this.reply(requestId, {ok: true})
        return
      case MiniappRequestType.STORAGE_FLUSH:
        this.reply(requestId, {ok: true})
        return

      case MiniappRequestType.AUTH_REFRESH:
        this.reply(requestId, {auth: this.authState()})
        return

      // ── Acknowledged, but not actually simulated ──────────────────────
      // These reply ok so a miniapp's happy path keeps running, but the
      // simulator does nothing: no browser opens, no clipboard is written, no
      // VAD or IMU exists. The README promises a gap looks like a gap, so
      // record them as stubs — otherwise a developer reads a green run as
      // proof the feature works and finds out on hardware.
      case MiniappRequestType.OPEN_URL:
        this.log("request", `system.openUrl(${String(payload.url)})`)
        this.noteStub(type)
        this.reply(requestId, {ok: true})
        return
      case MiniappRequestType.SHARE:
      case MiniappRequestType.COPY_CLIPBOARD:
      case MiniappRequestType.DOWNLOAD:
        this.log("request", `${type} ${JSON.stringify(payload).slice(0, 120)}`)
        this.noteStub(type)
        this.reply(requestId, {ok: true})
        return

      case MiniappRequestType.MIC_SET_VAD_ENABLED:
      case MiniappRequestType.MIC_SET_LOUDNESS_GATE_ENABLED:
      case MiniappRequestType.IMU_SET_ENABLED:
      case MiniappRequestType.TRANSCRIPTION_CONFIG:
      case MiniappRequestType.DASHBOARD_CONTENT_UPDATE:
        this.log("request", `${type} ${JSON.stringify(payload).slice(0, 120)}`)
        this.noteStub(type)
        this.reply(requestId, {ok: true})
        return

      case MiniappRequestType.LOCATION_POLL:
        // A fixed San Francisco fix. A miniapp cannot tell this from a real
        // one, so location logic "passes" here and fails in the field.
        this.noteStub(type)
        this.reply(requestId, {lat: 37.7956, lng: -122.3933, accuracy: 10, timestamp: Date.now()})
        return

      case MiniappRequestType.CALENDAR_LIST_EVENTS:
        this.noteStub(type)
        this.reply(requestId, {events: [], truncated: false})
        return

      default: {
        const name = type ?? "<unknown>"
        if (!this.unimplemented.includes(name)) this.unimplemented.push(name)
        this.log("error", `request "${name}" is not implemented by the simulator`)
        this.replyError(requestId, MiniappErrorCode.NOT_IMPLEMENTED, `simulator does not implement ${name}`)
        return
      }
    }
  }

  /** Record a request that was answered ok without being simulated. */
  private noteStub(type: string | undefined): void {
    const name = type ?? "<unknown>"
    if (!this.stubbed.includes(name)) this.stubbed.push(name)
  }

  private handleConnect(): void {
    this.connected = true
    const ack = {
      type: MiniappResponseType.CONNECT_ACK,
      userId: this.opts.userId ?? "sim-user",
      packageName: this.packageName,
      capabilities: this.glasses.model.capabilities,
      visibility: this.visibility,
      colorScheme: "dark",
      permissions: this.declaredPermissions(),
      auth: this.authState(),
    }
    this.log("request", `CONNECT → CONNECT_ACK (${this.glasses.model.name})`)
    this.push({payload: ack})
  }

  private declaredPermissions(): Record<string, boolean> {
    const record: Record<string, boolean> = {
      location: false,
      microphone: false,
      camera: false,
      notifications: false,
      calendar: false,
    }
    for (const perm of this.opts.manifest.permissions ?? []) {
      const canonical = MANIFEST_PERMISSION_MAP[String(perm.type).toUpperCase()]
      if (canonical) record[canonical] = true
    }
    return record
  }

  private authState(): Record<string, unknown> {
    return {
      mentraUserId: this.opts.userId ?? "sim-user",
      oemId: "simulator",
      token: "sim-miniapp-token",
      expiresAt: Date.now() + 60 * 60 * 1000,
    }
  }

  // ===========================================================================
  // Outbound: host → miniapp
  // ===========================================================================

  private push(envelope: {payload: unknown; requestId?: string}): void {
    this.send(JSON.stringify(envelope))
  }

  private reply(requestId: string | undefined, data: unknown): void {
    if (!requestId) return
    this.push({payload: {type: MiniappResponseType.REQUEST_RESULT, ok: true, data}, requestId})
  }

  private replyError(requestId: string | undefined, code: string, message: string): void {
    if (!requestId) return
    this.push({
      payload: {type: MiniappResponseType.REQUEST_RESULT, ok: false, error: {code, message}},
      requestId,
    })
  }

  /**
   * Fan an event out to the miniapp — but only if it subscribed, which is the
   * rule on the phone. A miniapp that forgot to subscribe stays silent here
   * too, instead of appearing to work in the simulator only.
   */
  emit(streamType: string, data: unknown): boolean {
    if (!this.subscriptions.has(streamType)) return false
    this.push({payload: {type: MiniappResponseType.EVENT, streamType, data}})
    return true
  }

  /** Deliver a touch gesture on both the bare and per-gesture stream variants. */
  touch(kind: string): boolean {
    const data = {kind}
    const bare = this.emit("touch_event", data)
    const specific = this.emit(`touch_event:${kind}`, data)
    const delivered = bare || specific
    this.log("event", `touch ${kind}${delivered ? "" : " (dropped — not subscribed)"}`)
    return delivered
  }

  /**
   * Deliver a temple-bar button press (`session.input.onButtonPress`).
   *
   * Distinct from `touch()`: the SDK maps onButtonPress to the `button_press`
   * stream, not `touch_event`. Without this the simulator could never deliver
   * the one interaction the scaffolder's template subscribes to, so a new
   * developer's first scaffold → simulate loop showed a permanently blank lens
   * with no error anywhere.
   */
  buttonPress(buttonId = "temple", pressType: "short" | "long" = "short"): boolean {
    const delivered = this.emit("button_press", {buttonId, pressType})
    this.log("event", `button ${buttonId}/${pressType}${delivered ? "" : " (dropped — not subscribed)"}`)
    return delivered
  }

  /** Deliver one mic frame. `data` is base64; the phone's PCM contract is 16k s16le mono. */
  audioChunk(data: string, opts: {sampleRate?: number; format?: string} = {}): boolean {
    return this.emit("audio_chunk", {
      data,
      sampleRate: opts.sampleRate ?? 16000,
      format: opts.format ?? "pcm_s16le",
    })
  }

  setVisibility(v: "foreground" | "background"): void {
    if (this.visibility === v) return
    this.visibility = v
    this.log("event", `visibility → ${v}`)
    this.push({payload: {type: MiniappResponseType.VISIBILITY_CHANGE, visibility: v}})
  }

  /** Tell the miniapp the session is going away, then let it flush a last frame. */
  willDisconnect(reason = "simulator shutting down"): void {
    this.push({payload: {type: MiniappResponseType.WILL_DISCONNECT, reason}})
  }

  // ===========================================================================
  // UI bus (session.ui ↔ window.veiller)
  // ===========================================================================

  private deliverUi(data: Record<string, unknown>): void {
    this.push({payload: {type: MiniappResponseType.EVENT, streamType: "_ui", data}})
  }

  uiOpen(): void {
    this.uiBound = true
    this.log("ui", "WebView opened")
    this.deliverUi({type: "UI_OPEN"})
  }

  uiClose(): void {
    if (!this.uiBound) return
    this.uiBound = false
    this.log("ui", "WebView closed")
    this.deliverUi({type: "UI_CLOSE"})
  }

  isUiOpen(): boolean {
    return this.uiBound
  }

  /** A `veiller.send` / `veiller.request` frame from the WebView side. */
  uiMessage(env: {channel: string; payload?: unknown; seq?: number; requestId?: string}): void {
    const out: Record<string, unknown> = {
      type: "UI_MESSAGE",
      channel: env.channel,
      payload: env.payload,
      seq: env.seq ?? 0,
    }
    if (env.requestId) out.requestId = env.requestId
    this.log("ui", `WebView → background ${env.channel}${env.requestId ? " (rpc)" : ""}`, env.payload)
    this.deliverUi(out)
  }

  uiCancel(requestId: string): void {
    this.deliverUi({type: "UI_CANCEL", requestId})
  }

  /** Subscribe to background → WebView frames. */
  onUiSend(cb: (env: Record<string, unknown>) => void): () => void {
    this.uiSendListeners.add(cb)
    return () => this.uiSendListeners.delete(cb)
  }

  private routeUiSend(payload: Record<string, unknown>): void {
    this.log("ui", `background → WebView ${String(payload.channel ?? payload.type)}`, payload.payload)
    if (!this.uiBound) return
    for (const cb of this.uiSendListeners) {
      try {
        cb(payload)
      } catch (err) {
        this.log("error", `UI listener threw: ${String(err)}`)
      }
    }
  }

  // ===========================================================================
  // Introspection
  // ===========================================================================

  storageSnapshot(): Record<string, string> {
    return Object.fromEntries(this.storage)
  }

  setStorage(key: string, value: string): void {
    this.storage.set(key, value)
  }

  activeSubscriptions(): string[] {
    return [...this.subscriptions]
  }

  /** Subscribe to the trace as it grows (the panel streams it live). */
  onTraceEntry(cb: (entry: TraceEntry) => void): () => void {
    this.traceListeners.add(cb)
    return () => this.traceListeners.delete(cb)
  }

  log(kind: TraceEntry["kind"], text: string, detail?: unknown): void {
    const entry: TraceEntry = {at: Date.now(), kind, text, ...(detail === undefined ? {} : {detail})}
    this.trace.push(entry)
    if (this.trace.length > 5000) this.trace.shift()
    this.opts.onTrace?.(entry)
    for (const cb of this.traceListeners) {
      try {
        cb(entry)
      } catch {
        /* a trace listener must never break the thing it is observing */
      }
    }
  }
}

function describeFrame(changes: string[], removed: number): string {
  const counts = changes.reduce<Record<string, number>>((acc, c) => {
    acc[c] = (acc[c] ?? 0) + 1
    return acc
  }, {})
  const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`)
  if (removed) parts.push(`${removed} removed`)
  return parts.join(", ") || "empty"
}
