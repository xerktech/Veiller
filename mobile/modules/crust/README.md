# @veiller/crust

The Veiller native runtime layer: an [Expo module](https://docs.expo.dev/modules/overview/)
providing the native capabilities the Veiller Engine's miniapp runtime sits on —
per-miniapp JS contexts (QuickJS on Android, JavaScriptCore on iOS), the
native side of the VeillerJS bridge, navigation, and device utilities.

You don't call crust directly from app code: it's a **peer dependency of
[`@veiller/engine`](https://www.npmjs.com/package/@veiller/engine)**. A host app
embedding the engine installs crust alongside it and Expo autolinking picks it
up.

## Install

```sh
npm install @veiller/crust@dev
```

> Currently published on the `dev` dist-tag (prerelease channel).

## Config plugin

The package ships an Expo config plugin (`app.plugin.js`) that carries its
Android build contract — Mapbox's maven repository, protobuf exclusions, and
core-library desugaring. Add it to the host app's Expo config:

```json
{"expo": {"plugins": ["@veiller/crust"]}}
```

Building with the navigation feature requires a `MAPBOX_DOWNLOADS_TOKEN` in
the Android build environment (Mapbox's SDK repository is authenticated).

At build time the Android side also reads the VeillerJS polyfill bundle from
its [`@veiller/jspolyfill`](https://www.npmjs.com/package/@veiller/jspolyfill)
sibling, which is declared as a dependency.

## Part of Veiller

Source lives in the [Veiller monorepo](https://github.com/Mentra-Community/MentraOS)
under `mobile/modules/crust`. Issues and contributions welcome there.
