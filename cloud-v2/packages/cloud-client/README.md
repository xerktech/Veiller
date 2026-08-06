# @veiller/cloud-client

The Veiller cloud client: connects a device (or a test harness) to the
Veiller cloud over the wire protocol defined in
[`@veiller/cloud-protocol`](https://www.npmjs.com/package/@veiller/cloud-protocol),
handling the handshake, message envelopes, and per-module message flows
(camera, audio, maps, reports, …).

Its main consumer is [`@veiller/engine`](https://www.npmjs.com/package/@veiller/engine),
which lists it as a peer dependency — an app embedding the engine installs
this package alongside it.

## Install

```sh
npm install @veiller/cloud-client@dev
```

> Currently published on the `dev` dist-tag (prerelease channel).

## Entry points

| Import | Use |
| --- | --- |
| `@veiller/cloud-client` | platform-neutral core: `CloudClient` plus the public config, transport, and error types (wire-protocol types are deliberately *not* re-exported — import those from `@veiller/cloud-protocol`) |
| `@veiller/cloud-client/react-native` | React Native transport bindings (used by the engine) |
| `@veiller/cloud-client/node` | Node transport bindings — requires the optional [`ws`](https://www.npmjs.com/package/ws) peer (`npm i ws`) |

The package ships TypeScript source and targets consumers that compile TS
themselves (Metro / bundlers / tsc).

## Part of Veiller

Source lives in the [Veiller monorepo](https://github.com/Mentra-Community/MentraOS)
under `cloud-v2/packages/cloud-client`. Issues and contributions welcome there.
