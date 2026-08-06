/**
 * WebView entry point. Imports the `veiller` global from the auto-injected
 * host shim and the typed `Channels` registry from src/shared/. The
 * WebView has zero direct native access — all hardware calls (glasses
 * display, sensors, BLE, etc.) go through `veiller.send(channel, payload)`
 * to background, which translates them into `session.*` SDK calls.
 */

import {createRoot} from "react-dom/client"
import {VeillerProvider} from "@veiller/miniapp/ui"
import "../shared/channels"
import {App} from "./App"
import "./styles.css"

const root = document.getElementById("root")
if (!root) {
  throw new Error("Missing #root element in index.html")
}

// VeillerProvider syncs <html class="dark"> with the host color scheme.
// Purely a CSS theme bridge — does NOT construct a MiniappSession.
createRoot(root).render(
  <VeillerProvider>
    <App />
  </VeillerProvider>,
)

// MUST call veiller.ready() on bootstrap so the host knows the WebView is
// mounted and can flush any buffered `session.ui.send` calls.
veiller.ready()
