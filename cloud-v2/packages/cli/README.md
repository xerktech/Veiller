# @veiller/cli

The Veiller developer CLI — the `veiller` command. Build, publish, and manage
Veiller miniapps against the Cloud V2 developer console.

It wraps [`@veiller/miniapp-cli`](https://www.npmjs.com/package/@veiller/miniapp-cli)
(the `dev` / `build` / `pack` author flow) and adds account and store operations:
`login`, `whoami`, `org`, `miniapps`, `releases`, and `publish`.

> **Bun-only.** This CLI ships as TypeScript and runs under [Bun](https://bun.sh)
> (`#!/usr/bin/env bun`). Use `bun` / `bunx`, not `npx`/Node.

## Install

```bash
bun add -g @veiller/cli@dev
veiller --help
```

Or run without installing:

```bash
bunx @veiller/cli@dev --help
```

## Common commands

```bash
veiller login              # sign in to the Veiller Developer Console
veiller dev                # local dev server with a signed Cloud V2 identity
veiller build              # build the current miniapp
veiller pack               # zip dist/ into a submittable release
veiller publish            # upload + publish a release
veiller miniapps list      # miniapps owned by your org
veiller releases submit    # submit an uploaded release for review
```

Run `veiller <command> --help` for the full option set.
