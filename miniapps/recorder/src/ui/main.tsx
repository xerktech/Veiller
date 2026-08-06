import {createRoot} from "react-dom/client"
import {VeillerProvider} from "@veiller/miniapp/ui"
import "../shared/channels"

import App from "./App"
import "./index.css"

/**
 * WebView entry. The `veiller` global is host-injected; `shared/channels`
 * augments its type with this miniapp's channel registry. `veiller.ready()` MUST
 * fire on bootstrap so the host runs the background-side session.ui.onOpen
 * handler that pushes the hydration snapshot.
 */
const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")
createRoot(root).render(
  <VeillerProvider>
    <App />
  </VeillerProvider>,
)

veiller.ready()
