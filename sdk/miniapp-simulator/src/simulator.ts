/**
 * Simulator — one miniapp, one pair of virtual glasses, one virtual phone.
 *
 * This is the object a scenario script (or the browser panel) drives. It owns
 * the emulated JSContext, the host, and the glasses, and exposes the small set
 * of verbs a person poking at real hardware would have: touch the temple, speak
 * into the mic, background the app, open the phone page, look at the lens.
 */

import {rm} from "node:fs/promises"

import {BackgroundRuntime, type BackgroundLog} from "./background"
import {loadBundle, type LoadedBundle} from "./bundle"
import {VirtualGlasses, type SceneView} from "./glasses"
import {SimulatorHost, type TraceEntry} from "./host"
import {resolveModel} from "./models"
import {PhoneUi} from "./phone-ui"

export interface SimulatorOptions {
  /** Path to a packed `.zip` bundle or an unpacked bundle directory. */
  bundle: string
  /** Device to emulate. Default "g2". */
  model?: string
  userId?: string
  /** Seed `session.storage` — e.g. a signed-in token, so boot skips onboarding. */
  storage?: Record<string, string>
  /** Mirror the miniapp's console and the host's traffic to stdout. */
  verbose?: boolean
  onTrace?: (entry: TraceEntry) => void
}

export class Simulator {
  public bundle!: LoadedBundle
  public glasses!: VirtualGlasses
  public host!: SimulatorHost
  /** The miniapp's phone page, headless. Call `phone.open()` to mount it. */
  public phone!: PhoneUi
  private runtime!: BackgroundRuntime
  private readonly opts: SimulatorOptions
  private started = false

  constructor(opts: SimulatorOptions) {
    this.opts = opts
  }

  /** Boot: load the bundle, spawn the context, run the handshake. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    this.bundle = await loadBundle(this.opts.bundle)
    this.glasses = new VirtualGlasses(resolveModel(this.opts.model))
    this.host = new SimulatorHost({
      manifest: this.bundle.manifest,
      glasses: this.glasses,
      ...(this.opts.userId ? {userId: this.opts.userId} : {}),
      ...(this.opts.storage ? {storage: this.opts.storage} : {}),
      onTrace: (entry) => {
        if (this.opts.verbose) printTrace(entry)
        this.opts.onTrace?.(entry)
      },
    })

    this.runtime = new BackgroundRuntime({
      code: this.bundle.backgroundCode,
      onBridge: (raw) => this.host.handleRaw(raw),
      onLog: (log: BackgroundLog) => this.host.log("log", `[${log.level}] ${log.text}`),
      onError: (err) => this.host.log("error", `background: ${err.message}`, err.stack),
    })
    this.host.attach((raw) => this.runtime.deliver(raw))
    this.phone = new PhoneUi(this.host)

    await this.runtime.start()
    this.runtime.init()
    await this.waitFor(() => this.host.connected, 5000, "miniapp never sent CONNECT")
  }

  async stop(): Promise<void> {
    if (!this.started) return
    this.host.willDisconnect()
    // Same ~50ms grace the phone gives a miniapp to flush a final render.
    await delay(60)
    this.runtime.stop()
    this.started = false
    // Loading a packed .zip expands it into a temp dir; without this every
    // run of a packed bundle left a full copy in /tmp for good.
    const tempRoot = this.bundle.tempRoot
    if (tempRoot) {
      try {
        await rm(tempRoot, {recursive: true, force: true})
      } catch {
        /* a leftover temp dir must never fail a run */
      }
    }
  }

  // ===========================================================================
  // Poking at the hardware
  // ===========================================================================

  /** Touch the temple bar: single_tap, double_tap, swipe_up, swipe_down, … */
  tap(): boolean {
    return this.host.touch("single_tap")
  }
  doubleTap(): boolean {
    return this.host.touch("double_tap")
  }
  swipeUp(): boolean {
    return this.host.touch("swipe_up")
  }
  swipeDown(): boolean {
    return this.host.touch("swipe_down")
  }
  gesture(kind: string): boolean {
    return this.host.touch(kind)
  }

  /**
   * Press the temple-bar button (`session.input.onButtonPress`).
   *
   * Not the same stream as `tap()`: onButtonPress subscribes to `button_press`
   * while the tap/swipe helpers emit `touch_event`. An app that only listens
   * for button presses — which is what the scaffolder's template does — sees
   * nothing from `tap()`.
   */
  buttonPress(buttonId = "temple", pressType: "short" | "long" = "short"): boolean {
    return this.host.buttonPress(buttonId, pressType)
  }

  /**
   * Feed the mic. Pass base64 PCM directly, or a duration to synthesise that
   * many milliseconds of 16k s16le silence — enough for apps that only care
   * that frames keep arriving.
   */
  speak(opts: {base64?: string; ms?: number; format?: string} = {}): boolean {
    const base64 = opts.base64 ?? silencePcm(opts.ms ?? 100)
    return this.host.audioChunk(base64, opts.format ? {format: opts.format} : {})
  }

  background(): void {
    this.host.setVisibility("background")
  }
  foreground(): void {
    this.host.setVisibility("foreground")
  }

  /** Emit any stream the miniapp may have subscribed to. */
  emit(streamType: string, data: unknown): boolean {
    return this.host.emit(streamType, data)
  }

  // ===========================================================================
  // Looking at it
  // ===========================================================================

  /** The lens as a text picture on the device's real geometry. */
  lens(view: SceneView = "main"): string {
    return this.glasses.toText(view)
  }

  /** The lens as SVG. */
  lensSvg(view: SceneView = "main"): string {
    return this.glasses.toSvg(view)
  }

  /** Every string currently on the lens, in draw order — handy for assertions. */
  lensText(view: SceneView = "main"): string[] {
    return this.glasses
      .lens(view)
      .filter((el) => el.type === "text" && el.text)
      .map((el) => el.text as string)
  }

  /** Wait until the lens stops changing, so assertions don't race a re-render. */
  async settle(quietMs = 120, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    let last = this.glasses.currentRevision()
    let stableSince = Date.now()
    while (Date.now() < deadline) {
      await delay(20)
      const now = this.glasses.currentRevision()
      if (now !== last) {
        last = now
        stableSince = Date.now()
        continue
      }
      if (Date.now() - stableSince >= quietMs) return
    }
  }

  async waitFor(predicate: () => boolean, timeoutMs = 3000, message = "condition not met"): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (predicate()) return
      await delay(20)
    }
    throw new Error(`Simulator.waitFor: ${message} (after ${timeoutMs}ms)`)
  }

  /** Wait until some text appears anywhere on the lens. */
  async waitForLens(substring: string, timeoutMs = 3000): Promise<void> {
    await this.waitFor(
      () => this.lensText().some((t) => t.includes(substring)),
      timeoutMs,
      `lens never showed ${JSON.stringify(substring)} (showing: ${JSON.stringify(this.lensText())})`,
    )
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** `ms` of 16kHz mono s16le silence, base64 — a valid, boring mic frame. */
export function silencePcm(ms: number): string {
  const samples = Math.max(1, Math.round((16000 * ms) / 1000))
  return Buffer.alloc(samples * 2).toString("base64")
}

function printTrace(entry: TraceEntry): void {
  const stamp = new Date(entry.at).toISOString().slice(11, 23)
  process.stdout.write(`${stamp} ${entry.kind.padEnd(7)} ${entry.text}\n`)
}
