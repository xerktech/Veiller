/**
 * Background JSContext entry point — Veiller Map miniapp.
 *
 * Constructed once by the Veiller host inside the per-miniapp JSContext.
 * `registerMiniapp(...)` wires the handler to fire after CONNECT lands;
 * the NavigationController instantiated here lives for the entire
 * session, surviving WebView open/close cycles.
 */

import {registerMiniapp} from "@veiller/miniapp/background"

import {NavigationController} from "./NavigationController"

registerMiniapp((session) => {
  new NavigationController(session).start()
})
