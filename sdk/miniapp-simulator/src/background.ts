/**
 * BackgroundRuntime — host-side handle on the emulated JSContext (see worker.ts).
 *
 * Mirrors what `VeillerJSRouter` does on the phone: spawn the context, evaluate
 * the bundle, send the init envelope once evaluation succeeded, then shuttle
 * raw bridge envelopes in both directions.
 */

export interface BackgroundLog {
  level: string
  text: string
  at: number
}

export interface BackgroundRuntimeOptions {
  /** Background bundle source (already-built classic script / IIFE). */
  code: string
  /** Called with each raw envelope the miniapp sends toward the host. */
  onBridge: (raw: string) => void
  onLog?: (log: BackgroundLog) => void
  onError?: (err: {message: string; stack: string}) => void
}

export class BackgroundRuntime {
  private worker: Worker | null = null
  private readonly opts: BackgroundRuntimeOptions
  /** Resolves when the worker has evaluated the bundle. */
  private loaded: Promise<void> | null = null

  constructor(opts: BackgroundRuntimeOptions) {
    this.opts = opts
  }

  async start(): Promise<void> {
    if (this.loaded) return this.loaded
    const worker = new Worker(new URL("./worker.ts", import.meta.url).href, {type: "module"})
    this.worker = worker

    this.loaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("background bundle did not finish evaluating within 15s")),
        15_000,
      )
      worker.addEventListener("message", (event: MessageEvent) => {
        const msg = event.data as {
          t?: string
          raw?: string
          level?: string
          text?: string
          message?: string
          stack?: string
        }
        switch (msg?.t) {
          case "ready":
            worker.postMessage({t: "eval", code: this.opts.code})
            return
          case "loaded":
            clearTimeout(timer)
            resolve()
            return
          case "bridge":
            if (typeof msg.raw === "string") this.opts.onBridge(msg.raw)
            return
          case "log":
            this.opts.onLog?.({level: msg.level ?? "log", text: msg.text ?? "", at: Date.now()})
            return
          case "error":
            clearTimeout(timer)
            this.opts.onError?.({message: msg.message ?? "unknown", stack: msg.stack ?? ""})
            // An error during evaluation must fail start(); after that it is
            // just a runtime error the host reports and lives with.
            reject(new Error(msg.message ?? "background error"))
            return
        }
      })
      worker.addEventListener("error", (event) => {
        clearTimeout(timer)
        const message = (event as ErrorEvent).message ?? "worker error"
        this.opts.onError?.({message, stack: ""})
        reject(new Error(message))
      })
    })

    return this.loaded
  }

  /** Deliver the host's `{kind:"init"}` — makes the bundle's registerMiniapp handler run. */
  init(sessionId = "sim-session"): void {
    this.worker?.postMessage({t: "init", sessionId})
  }

  /** Push a raw envelope into the miniapp's transport. */
  deliver(raw: string): void {
    this.worker?.postMessage({t: "bridge", raw})
  }

  stop(): void {
    this.worker?.terminate()
    this.worker = null
    this.loaded = null
  }
}
