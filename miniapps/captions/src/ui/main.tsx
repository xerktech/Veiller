import {createRoot} from "react-dom/client"
import {VeillerProvider} from "@veiller/miniapp/ui"
import "../shared/channels"

import App from "./App"
import "./index.css"

/**
 * WebView entry point. The `veiller` global is auto-injected by the host via
 * veillerUiShim — `shared/channels` augments its TypeScript declaration with this
 * miniapp's typed channel registry.
 *
 * `<VeillerProvider>` syncs the host color scheme onto `<html class="dark">`; it
 * does NOT construct a MiniappSession (that lives in the background JSContext).
 *
 * `veiller.ready()` MUST fire on bootstrap so the host knows the WebView is
 * mounted and the background-side session.ui.onOpen handler fires — that
 * handler pushes the full captions:snapshot used to hydrate the UI.
 */
const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")
createRoot(root).render(
  <VeillerProvider>
    <App />
  </VeillerProvider>,
)

veiller.ready()
