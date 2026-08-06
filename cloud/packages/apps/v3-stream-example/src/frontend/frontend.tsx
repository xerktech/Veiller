import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VeillerAuthProvider } from "@veiller/react";

import "./index.css";

import App from "./App";

const element = document.getElementById("root");

if (!element) {
  throw new Error("Root element not found");
}

const app = (
  <StrictMode>
    <VeillerAuthProvider>
      <App />
    </VeillerAuthProvider>
  </StrictMode>
);

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(element));
  root.render(app);
} else {
  createRoot(element).render(app);
}
