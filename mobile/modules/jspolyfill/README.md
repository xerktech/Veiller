# @veiller/jspolyfill

The VeillerJS polyfill bundle. Veiller runs each miniapp in its own bare JS
context (JavaScriptCore on iOS, QuickJS on Android); this package provides the
browser-like standard library those contexts lack — `console`, timers,
`fetch`, `WebSocket`, `localStorage`, `crypto.getRandomValues`, and
`crypto.randomUUID` — implemented over a single `__dispatch` native bridge,
plus the `__deliver` / `signalReady` plumbing the host runtime relies on.
`crypto.subtle` is not implemented.

You don't import this package from app code: it's a **peer of the runtime
stack**. [`@veiller/crust`](https://www.npmjs.com/package/@veiller/crust)'s
Android build reads the bundle from this package's `assets/` at build time,
and the engine injects it into each miniapp context at spawn.

## Install

Installed automatically alongside
[`@veiller/engine`](https://www.npmjs.com/package/@veiller/engine) /
`@veiller/crust`. For direct use:

```sh
npm install @veiller/jspolyfill@dev
```

> Currently published on the `dev` dist-tag (prerelease channel).

## Part of Veiller

Source lives in the [Veiller monorepo](https://github.com/Mentra-Community/MentraOS)
under `mobile/modules/jspolyfill`. Issues and contributions welcome there.
