/**
 * Serving the miniapp's phone page to a real browser.
 *
 * On the phone the page loads inside a WebView the host has already prepared:
 * `window.Veiller` carries the globals, `window.veiller` is the shim that talks
 * to the background context, and `window.ReactNativeWebView.postMessage` is the
 * native channel underneath. A browser tab has none of that, so this module
 * injects the first two and replaces the third with a WebSocket back to the
 * simulator.
 *
 * The shim itself is the app's own `buildVeillerUiShim` — not a re-implementation
 * — so the page runs against the same buffering, RPC, and legacy-alias behaviour
 * it will meet on a phone.
 */

import {buildVeillerUiShim} from "../../../mobile/modules/engine/src/services/veillerUiShim"

export interface UiHostOptions {
  packageName: string
  /** WebSocket path the injected bridge connects to. */
  socketPath: string
  colorScheme?: "light" | "dark"
}

/**
 * The `window.ReactNativeWebView` stand-in. Buffers until the socket opens so
 * the shim's `{type:"ready"}` handshake can't be lost in the connect race — the
 * same failure mode the real shim guards against on Android.
 */
function bridgeScript(socketPath: string): string {
  return `
(function () {
  var queue = [];
  var socket = null;
  function connect() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(proto + "//" + location.host + ${JSON.stringify(socketPath)});
    socket.onopen = function () {
      while (queue.length) socket.send(queue.shift());
    };
    socket.onmessage = function (ev) {
      try {
        var frame = JSON.parse(ev.data);
        if (window.__veiller && window.__veiller.recv) window.__veiller.recv(frame);
      } catch (e) { /* malformed frame — drop, as the injected recv would */ }
    };
    socket.onclose = function () { socket = null; setTimeout(connect, 500); };
  }
  connect();
  window.ReactNativeWebView = {
    postMessage: function (raw) {
      if (socket && socket.readyState === 1) socket.send(raw);
      else queue.push(raw);
    },
  };
})();
`.trim()
}

/** Mirrors the phone's `buildMiniappGlobalsScript` for the fields a page reads. */
function globalsScript(opts: UiHostOptions): string {
  const globals = {
    packageName: opts.packageName,
    platform: "simulator",
    capabilities: ["share", "open_url", "copy_clipboard", "download"],
    miniappLocal: true,
    safeAreaInsets: {top: 0, bottom: 0, left: 0, right: 0},
    capsuleMenu: {top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0},
    colorScheme: opts.colorScheme ?? "dark",
  }
  // Both prefixes: pages published before the Veiller rename style themselves
  // off `var(--mentra-*)`.
  const vars = ["safe-top", "safe-bottom", "safe-left", "safe-right"]
    .flatMap((name) => [`--veiller-${name}: 0px;`, `--mentra-${name}: 0px;`])
    .join(" ")
  return `
window.Veiller = ${JSON.stringify(globals)};
window.Mentra = window.Veiller;
(function () {
  var style = document.createElement("style");
  style.textContent = ":root { ${vars} }";
  document.head.appendChild(style);
})();
`.trim()
}

/**
 * Inject the host environment into a miniapp's UI HTML. Everything goes in
 * before the page's own scripts, which is the ordering guarantee the real host
 * provides via `injectedJavaScriptBeforeContentLoaded`.
 */
export function injectHostEnvironment(html: string, opts: UiHostOptions): string {
  const injected = [
    `<script>${globalsScript(opts)}</script>`,
    `<script>${bridgeScript(opts.socketPath)}</script>`,
    `<script>${buildVeillerUiShim({packageName: opts.packageName})}</script>`,
  ].join("\n")

  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>\n${injected}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1>\n${injected}`)
  return `${injected}\n${html}`
}
