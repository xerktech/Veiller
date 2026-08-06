/**
 * Typed channel registry — single source of truth for the names + payload
 * shapes that flow between this miniapp's background JSContext and its UI
 * WebView. Both halves import this file at build time; the bundler inlines
 * the declarations so there's no runtime resolution.
 *
 * Add a key per channel. The TypeScript generic on `veiller.send` /
 * `veiller.on` / `session.ui.send` / `session.ui.on` enforces names + payload
 * shapes at compile time so the two halves can't drift.
 */

export interface Channels {
  // WebView → background
  "ping": {at: number}

  // background → WebView
  "pong": {at: number; roundtripMs: number}
}

declare global {
  // Augment the `veiller` global from @veiller/miniapp/ui with this miniapp's
  // typed channel registry so authors get compile-time enforcement on every
  // veiller.send / veiller.on call without re-declaring it.
  // eslint-disable-next-line no-var
  var veiller: import("@veiller/miniapp/ui").VeillerTyped<Channels>
}
