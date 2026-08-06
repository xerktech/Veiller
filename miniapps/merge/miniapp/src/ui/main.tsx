import {VeillerProvider} from "@veiller/miniapp/ui"
import {createRoot} from "react-dom/client"

import "../shared/channels"
import App from "./App"
import "./index.css"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

createRoot(root).render(
  <VeillerProvider>
    <App />
  </VeillerProvider>,
)

veiller.ready()
