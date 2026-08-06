# create-veiller-miniapp

Scaffold a new [Veiller](https://github.com/Mentra-Community/MentraOS)
miniapp project — the `bun create` starter for apps that run on Veiller
smart glasses.

## Usage

```sh
bun create veiller-miniapp my-app
cd my-app
bun install
bun run dev
```

> **Bun-only.** The scaffolder and the generated project's tooling run under
> [Bun](https://bun.sh) — use `bun` / `bunx`, not `npx`.

The generated project comes wired with
[`@veiller/miniapp`](https://www.npmjs.com/package/@veiller/miniapp) (the SDK
runtime) and [`@veiller/miniapp-cli`](https://www.npmjs.com/package/@veiller/miniapp-cli)
(the `dev` / `build` / `pack` author flow), a `miniapp.json` manifest, and a
TypeScript setup. Dependency pins are stamped at publish time to the exact
SDK versions this scaffolder shipped with, so a generated project installs
on any release channel.

To publish a finished miniapp to the Veiller Miniapp Store, see
[`@veiller/cli`](https://www.npmjs.com/package/@veiller/cli) (`veiller login` /
`veiller publish`).

## Part of Veiller

Source lives in the [Veiller monorepo](https://github.com/Mentra-Community/MentraOS)
under `sdk/create-veiller-miniapp`. Issues and contributions welcome there.
