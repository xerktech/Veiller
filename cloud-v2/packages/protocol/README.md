# @veiller/cloud-protocol

The Veiller phone ↔ cloud wire protocol: message schemas, envelopes, and
error types shared by everything that speaks to the Veiller cloud. Pure
TypeScript + [zod](https://github.com/colinhacks/zod) — no server or native
dependencies.

This is a **leaf package**: [`@veiller/cloud-client`](https://www.npmjs.com/package/@veiller/cloud-client)
and [`@veiller/engine`](https://www.npmjs.com/package/@veiller/engine) depend on
it, and the Veiller cloud runtime consumes the same schemas server-side, so
both ends of the wire validate against one definition.

## Install

You normally get this package automatically as a dependency of
`@veiller/cloud-client` or a peer of `@veiller/engine`. For direct use:

```sh
npm install @veiller/cloud-protocol@dev
```

> Currently published on the `dev` dist-tag (prerelease channel).

## Usage

```ts
import {envelopeSchema, PROTOCOL_MAJOR, type Envelope} from "@veiller/cloud-protocol";

const message: Envelope = envelopeSchema.parse(JSON.parse(raw));

// or per-module subpaths:
import {normalizePhotoSizeTier} from "@veiller/cloud-protocol/camera";
```

Modules: `envelope`, `messages`, `handshake`, `control`, `camera`, `audio`,
`maps`, `errors` — each importable as `@veiller/cloud-protocol/<module>`.

The package ships TypeScript source (`main: ./src/index.ts`) and targets
consumers that compile TS themselves (Metro / bundlers / tsc); it is not
precompiled for plain Node `require`.

## Part of Veiller

Source lives in the [Veiller monorepo](https://github.com/Mentra-Community/MentraOS)
under `cloud-v2/packages/protocol`. Issues and contributions welcome there.
