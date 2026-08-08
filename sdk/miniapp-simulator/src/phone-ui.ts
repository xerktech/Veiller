/**
 * PhoneUi — a headless stand-in for the miniapp's phone WebView.
 *
 * The real page talks to its background context through `window.veiller`:
 * `ready()` announces the mount, `send`/`on` carry broadcasts, and `request`
 * makes an RPC call. This is the same conversation with no browser attached, so
 * a scenario can sign in, press Start, or read the live transcript exactly the
 * way a tap on the phone would — and assert on what the background pushes back.
 *
 * The browser panel drives the identical host verbs; this class exists so
 * tests and scripted walkthroughs don't need a browser at all.
 */

import type {SimulatorHost} from "./host"

type Listener = (payload: unknown) => void

export class PhoneUi {
  private seq = 1
  private rpc = 0
  private readonly listeners = new Map<string, Set<Listener>>()
  /** Last payload seen per channel — lets a scenario read state without racing. */
  private readonly latest = new Map<string, unknown>()
  private readonly pending = new Map<string, (payload: unknown) => void>()
  private detach: (() => void) | null = null

  constructor(private readonly host: SimulatorHost) {}

  /** Mount the page: the host binds it and the background fires `ui.onOpen`. */
  open(): void {
    if (!this.detach) {
      this.detach = this.host.onUiSend((env) => this.receive(env))
    }
    this.host.uiOpen()
  }

  /** Unmount: `ui.onClose` fires on the background side and sends start dropping. */
  close(): void {
    this.host.uiClose()
  }

  send(channel: string, payload?: unknown): void {
    this.host.uiMessage({channel, payload, seq: this.seq++})
  }

  /** RPC — resolves with whatever the background's `ui.handle` handler returned. */
  request<T = unknown>(channel: string, payload?: unknown, timeoutMs = 5000): Promise<T> {
    const requestId = `sim-rpc-${++this.rpc}`
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`PhoneUi.request("${channel}") timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(requestId, (envelope) => {
        clearTimeout(timer)
        const reply = envelope as {ok?: boolean; result?: unknown; error?: {message?: string}}
        if (reply?.ok === true) resolve(reply.result as T)
        else reject(new Error(reply?.error?.message ?? "RPC failed"))
      })
      this.host.uiMessage({channel, payload, seq: this.seq++, requestId})
    })
  }

  on(channel: string, cb: Listener): () => void {
    let set = this.listeners.get(channel)
    if (!set) {
      set = new Set()
      this.listeners.set(channel, set)
    }
    set.add(cb)
    return () => set!.delete(cb)
  }

  /** The most recent payload broadcast on a channel, or undefined. */
  last<T = unknown>(channel: string): T | undefined {
    return this.latest.get(channel) as T | undefined
  }

  /** Wait for the next payload on a channel that satisfies `predicate`. */
  waitFor<T = unknown>(
    channel: string,
    predicate: (payload: T) => boolean = () => true,
    timeoutMs = 5000,
  ): Promise<T> {
    const existing = this.latest.get(channel) as T | undefined
    if (existing !== undefined && predicate(existing)) return Promise.resolve(existing)
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        off()
        reject(new Error(`PhoneUi.waitFor("${channel}") timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      const off = this.on(channel, (payload) => {
        if (!predicate(payload as T)) return
        clearTimeout(timer)
        off()
        resolve(payload as T)
      })
    })
  }

  private receive(env: Record<string, unknown>): void {
    const requestId = env.requestId as string | undefined
    if (requestId) {
      const settle = this.pending.get(requestId)
      if (settle) {
        this.pending.delete(requestId)
        settle(env.payload)
      }
      return
    }
    const channel = env.channel as string | undefined
    if (!channel) return
    this.latest.set(channel, env.payload)
    for (const cb of this.listeners.get(channel) ?? []) {
      try {
        cb(env.payload)
      } catch {
        /* a listener throwing must not break the bus */
      }
    }
  }
}
