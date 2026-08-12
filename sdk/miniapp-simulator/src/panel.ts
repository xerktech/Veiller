/**
 * The simulator's control panel: a browser page showing the lens, the phone
 * page, and the buttons you would otherwise need hardware to press.
 *
 * Three surfaces share one server:
 *   `/`            the panel itself
 *   `/app/…`       the miniapp's real UI bundle, with the host environment
 *                  injected (see ui-host.ts) so it behaves as it would in the
 *                  phone's WebView
 *   `/ws/panel`    live lens + trace out, control commands in
 *   `/ws/ui`       the WebView bridge for `/app`
 */

import {existsSync} from "node:fs"
import {readFile} from "node:fs/promises"
import {extname, join, normalize, relative, resolve} from "node:path"

import {panelHtml} from "./panel-html"
import type {Simulator} from "./simulator"
import {injectHostEnvironment} from "./ui-host"

export interface PanelHandle {
  port: number
  url: string
  stop: () => void
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
}

/** What the panel needs from a socket; also the per-socket data Bun carries. */
type PanelSocket = {send: (data: string) => void}
interface SocketData {
  kind: "panel" | "ui"
}

export function startPanel(sim: Simulator, port = 8770): PanelHandle {
  const panelSockets = new Set<PanelSocket>()
  let uiSocket: PanelSocket | null = null

  const broadcast = (msg: unknown) => {
    const raw = JSON.stringify(msg)
    for (const s of panelSockets) {
      try {
        s.send(raw)
      } catch {
        /* a dead socket is dropped on its close event */
      }
    }
  }

  const state = () => ({
    type: "state" as const,
    model: sim.glasses.model.name,
    width: sim.glasses.model.scene.width,
    height: sim.glasses.model.scene.height,
    svg: sim.lensSvg(),
    text: sim.lens(),
    subscriptions: sim.host.activeSubscriptions(),
    storage: sim.host.storageSnapshot(),
    visibility: sim.host.visibility,
    uiOpen: sim.host.isUiOpen(),
    unimplemented: sim.host.unimplemented,
    stubbed: sim.host.stubbed,
    hasUi: sim.bundle.uiEntry !== null,
    name: sim.bundle.manifest.name,
    version: sim.bundle.manifest.version,
    packageName: sim.bundle.manifest.packageName,
  })

  // Push a fresh frame whenever anything happens. The lens revision guards
  // against flooding the panel with identical frames from the app's ticker.
  let lastRevision = -1
  const tick = setInterval(() => {
    if (!panelSockets.size) return
    const revision = sim.glasses.currentRevision()
    if (revision === lastRevision) return
    lastRevision = revision
    broadcast(state())
  }, 100)

  sim.host.onUiSend((env) => {
    if (!uiSocket) return
    const frame: Record<string, unknown> =
      env.type === "UI_CANCEL"
        ? {type: "cancel", requestId: env.requestId}
        : {type: "msg", seq: env.seq ?? 0, channel: env.channel, payload: env.payload}
    if (env.type !== "UI_CANCEL" && typeof env.requestId === "string") frame.requestId = env.requestId
    uiSocket.send(JSON.stringify(frame))
  })

  const uiRoot = sim.bundle.uiEntry ? resolve(sim.bundle.uiEntry, "..") : null

  const server = Bun.serve<SocketData, never>({
    port,
    // Loopback only. The panel's WebSocket takes unauthenticated commands —
    // storage writes, gestures, arbitrary stream emits — so binding every
    // interface handed anyone on the developer's network full control of the
    // running miniapp, while the CLI printed "localhost" as if it were
    // private. The phone never talks to this server (that is `dev`'s job), so
    // there is nothing to lose by refusing off-host connections.
    hostname: "127.0.0.1",
    async fetch(req, srv) {
      const url = new URL(req.url)

      if (url.pathname === "/ws/panel" || url.pathname === "/ws/ui") {
        const kind: SocketData["kind"] = url.pathname === "/ws/ui" ? "ui" : "panel"
        if (srv.upgrade(req, {data: {kind}})) return undefined
        return new Response("expected websocket", {status: 400})
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(panelHtml(), {headers: {"content-type": MIME[".html"]}})
      }

      if (url.pathname === "/lens.svg") {
        return new Response(sim.lensSvg(), {headers: {"content-type": MIME[".svg"]}})
      }

      if (url.pathname.startsWith("/app")) {
        if (!uiRoot || !sim.bundle.uiEntry) {
          return new Response("This miniapp does not ship a phone page.", {status: 404})
        }
        const rel = url.pathname.replace(/^\/app\/?/, "") || "index.html"
        // Contain path traversal: the served file must stay under the bundle's
        // UI directory even if the page asks for "../../etc/passwd".
        const target = normalize(join(uiRoot, rel))
        if (relative(uiRoot, target).startsWith("..")) return new Response("not found", {status: 404})
        if (!existsSync(target)) return new Response("not found", {status: 404})

        const ext = extname(target).toLowerCase()
        if (ext === ".html") {
          const html = await readFile(target, "utf8")
          return new Response(
            injectHostEnvironment(html, {
              packageName: sim.bundle.manifest.packageName,
              socketPath: "/ws/ui",
            }),
            {headers: {"content-type": MIME[".html"]}},
          )
        }
        return new Response(await readFile(target), {
          headers: {"content-type": MIME[ext] ?? "application/octet-stream"},
        })
      }

      return new Response("not found", {status: 404})
    },

    websocket: {
      open(ws) {
        if (ws.data.kind === "ui") {
          // Binding happens on the page's own `{type:"ready"}` frame, not here
          // — the socket is up before the shim has mounted, and firing UI_OPEN
          // early would let the background push a snapshot into a page with no
          // listeners attached yet.
          uiSocket = ws as unknown as PanelSocket
          return
        }
        panelSockets.add(ws as unknown as PanelSocket)
        ws.send(JSON.stringify(state()))
        for (const entry of sim.host.trace.slice(-200)) {
          ws.send(JSON.stringify({type: "trace", entry}))
        }
      },
      message(ws, raw) {
        if (ws.data.kind === "ui") {
          handleUiFrame(sim, String(raw))
          return
        }
        let msg: {cmd?: string; arg?: unknown}
        try {
          msg = JSON.parse(String(raw))
        } catch {
          return
        }
        runCommand(sim, msg.cmd ?? "", msg.arg)
        broadcast(state())
      },
      close(ws) {
        if (ws.data.kind === "ui") {
          if (uiSocket === (ws as unknown as PanelSocket)) {
            uiSocket = null
            sim.host.uiClose()
          }
          return
        }
        panelSockets.delete(ws as unknown as PanelSocket)
      },
    },
  })

  sim.host.onTraceEntry((entry) => broadcast({type: "trace", entry}))

  return {
    port: server.port ?? port,
    url: `http://localhost:${server.port ?? port}`,
    stop: () => {
      clearInterval(tick)
      server.stop(true)
    },
  }
}

/** Frames from the miniapp's page, in the shim's wire format. */
function handleUiFrame(sim: Simulator, raw: string): void {
  let env: {type?: string; channel?: string; payload?: unknown; seq?: number; requestId?: string}
  try {
    env = JSON.parse(raw)
  } catch {
    return
  }
  if (env.type === "ready") {
    sim.host.uiOpen()
    return
  }
  if (env.type === "msg" && typeof env.channel === "string") {
    sim.host.uiMessage({
      channel: env.channel,
      payload: env.payload,
      seq: env.seq ?? 0,
      ...(env.requestId ? {requestId: env.requestId} : {}),
    })
    return
  }
  if (env.type === "cancel" && typeof env.requestId === "string") {
    sim.host.uiCancel(env.requestId)
  }
}

function runCommand(sim: Simulator, cmd: string, arg: unknown): void {
  switch (cmd) {
    case "gesture":
      sim.gesture(String(arg))
      return
    case "button": {
      // session.input.onButtonPress rides `button_press`, a different stream
      // from the tap/swipe gestures above. The panel sends "short" / "long";
      // a scripted client may send {buttonId, pressType} instead.
      const opts = typeof arg === "string" ? {pressType: arg} : ((arg ?? {}) as Record<string, unknown>)
      const buttonId = typeof opts.buttonId === "string" ? opts.buttonId : "temple"
      sim.buttonPress(buttonId, opts.pressType === "long" ? "long" : "short")
      return
    }
    case "mic":
      sim.speak({ms: Number(arg) || 200})
      return
    case "background":
      sim.background()
      return
    case "foreground":
      sim.foreground()
      return
    case "emit": {
      const {stream, data} = (arg ?? {}) as {stream?: string; data?: unknown}
      if (stream) sim.emit(stream, data ?? {})
      return
    }
    case "storage": {
      const {key, value} = (arg ?? {}) as {key?: string; value?: string}
      if (key !== undefined) sim.host.setStorage(key, String(value ?? ""))
      return
    }
    default:
      return
  }
}
