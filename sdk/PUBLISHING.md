# Publishing the Miniapp SDK to npm

The miniapp SDK + Cloud V2 developer packages ship as five npm packages, all from
one workflow ([`miniapp-sdk-release.yml`](../.github/workflows/miniapp-sdk-release.yml)):

| Package | Source | What it is |
| --- | --- | --- |
| [`@veiller/miniapp`](https://www.npmjs.com/package/@veiller/miniapp) | `mobile/modules/miniapp` | The SDK runtime (`MiniappSession`, modules, `/background`, `/ui`, `/react`). Ships compiled JS + types. |
| [`@veiller/miniapp-cli`](https://www.npmjs.com/package/@veiller/miniapp-cli) | `sdk/miniapp-cli` | The `veiller-miniapp` author CLI (`dev` / `release` / `pack` / `manifest`). Bun-only. |
| [`create-veiller-miniapp`](https://www.npmjs.com/package/create-veiller-miniapp) | `sdk/create-veiller-miniapp` | The `bunx create-veiller-miniapp` scaffolder + template. Bun-only. |
| [`@veiller/auth`](https://www.npmjs.com/package/@veiller/auth) | `cloud-v2/packages/auth` | Cloud V2 auth helper for miniapp backends — verify Local Runtime JWKS tokens. Compiled JS + types (Node-compatible). |
| [`@veiller/cli`](https://www.npmjs.com/package/@veiller/cli) | `cloud-v2/packages/cli` | The `veiller` developer CLI — build + **publish** to the Cloud V2 console. Wraps `@veiller/miniapp-cli` and adds login/org/miniapps/releases/publish. Bun-only. This is the CLI most developers want. |

`@veiller/miniapp`, `@veiller/miniapp-cli`, `create-veiller-miniapp`, and `@veiller/auth`
are not on npm yet. `@veiller/cli` has a legacy `1.0.3` on the `latest` tag (the
v1 CLI); the Cloud V2 rewrite here has base `2.0.0-dev.*` and publishes to the
`dev`/`beta` channel tags, so it does **not** disturb `latest` — see the
collision note below. This doc is how they get to npm and stay there.

## Channels (branch → derived version → dist-tag)

Git holds **one prerelease base version per package** (`X.Y.Z-dev.N`), only ever
edited on `dev`. CI derives the published version from the branch at publish
time ([`npm-channel.mjs`](../.github/scripts/npm-channel.mjs) +
[`stamp-channel-manifests.mjs`](../.github/scripts/stamp-channel-manifests.mjs)),
so **merging a branch up the chain IS the promotion** — no version edits ride
`dev → staging → main`:

| Branch | Base in git | Published as | dist-tag | `npm install` resolves it when… |
| --- | --- | --- | --- | --- |
| `dev` | `1.2.3-dev.4` | `1.2.3-dev.4` | `dev` | `npm i @veiller/miniapp@dev` |
| `staging` | `1.2.3-dev.4` | `1.2.3-beta.4` | `beta` | `npm i @veiller/miniapp@beta` |
| `main` | `1.2.3-dev.4` | `1.2.3` | `latest` | `npm i @veiller/miniapp` (default) |

The prerelease number carries across channels (`-dev.3` promotes to `-beta.3`)
so a beta is traceable to the dev build it came from. Each channel's artifact is
a **rebuild of that branch's code** — npm has no re-tag-the-same-bytes
promotion.

**Publish mode per channel:** `dev` publishes **directly** (fast internal
iteration). `beta` and `latest` go through **npm's staging queue**
(`npm stage publish`) — a maintainer must approve each version in the npm UI
(2FA) before it goes live; that approval is the only gate past merge, so
**merging to main IS the go signal**. Why the queue: internal ranges are
carets, so a new peer version *floats into already-approved `@veiller/engine`
installs on the same channel* — every version that can reach beta/latest
therefore needs its own approval. A staged-but-unapproved version isn't live
(`npm view` won't list it), so a re-merge before approval just re-attempts the
stage (tolerated); **approve or reject staged versions promptly** to keep the
queue meaningful.

## One-time setup (required before the first publish)

1. **npm org access.** The `@veiller` org already owns `@veiller/sdk`,
   `@mentra/types`, and `@veiller/bluetooth-sdk`, so the scope exists. Make sure
   the publishing account is a member with **publish** rights.
2. **Create an npm automation token.** npm → _Access Tokens_ → _Generate New
   Token_ → **Automation** (bypasses 2FA, which CI can't satisfy). Scope it to the
   `@veiller` org.
3. **Add it as a GitHub repo secret named `NPM_TOKEN`.** The
   `Release Miniapp SDK` workflow wires it in as `NODE_AUTH_TOKEN`.
4. **First publish of each scoped package is public.** Each package now carries
   `"publishConfig": { "access": "public" }`, and the workflow also passes
   `--access public`, so no manual flag is needed.

## How CI publishing works

Workflow: [`.github/workflows/miniapp-sdk-release.yml`](../.github/workflows/miniapp-sdk-release.yml).

- **Trigger:** push to `main` / `staging` / `dev` that touches any of the
  package dirs (or the workflow/scripts themselves). Also `workflow_dispatch`.
- **Gate:** a package publishes **when its derived version for the branch is
  absent from npm** (decided by
  [`.github/scripts/miniapp-sdk-release-info.mjs`](../.github/scripts/miniapp-sdk-release-info.mjs)
  — registry-state detection; a promotion merge doesn't change the version
  field, so git-diffing can't see it). E404 is the only "absent" signal — any
  other npm error fails the run rather than guessing. Extra gates: a package
  that has **never** been published only ships via a supervised
  `workflow_dispatch` with `force_release=true`, and a package is held back
  (with a notice) while any internal dep it pins doesn't yet exist on the
  channel.
- **Idempotent:** the derived version already existing on npm means "nothing to
  do" — re-running a workflow or re-merging a branch is safe.
- **Version stamp:** before packing, [`stamp-channel-manifests.mjs`](../.github/scripts/stamp-channel-manifests.mjs)
  rewrites every family manifest in the CI checkout to the branch's derived
  versions, including cross-package ranges (`^0.1.0-dev.0` → `^0.1.0` on main).
  Checkout-only; never committed — the repo keeps the base versions.
- **Ordered:** packages publish sequentially in dependency order
  (`@veiller/miniapp` → `@veiller/miniapp-cli` → `create-veiller-miniapp` →
  `@veiller/auth` → `@veiller/cli`) so downstream pins resolve once their base lands
  (the scaffolder's template pins, and `@veiller/cli`'s dep on `@veiller/miniapp-cli`).
- **`file:` rewrite:** before packing, [`rewrite-file-deps.mjs`](../.github/scripts/rewrite-file-deps.mjs)
  rewrites any workspace `file:` dependency to the referenced package's **exact**
  version. Today only `@veiller/cli` has one (`@veiller/miniapp-cli`), which is a
  `file:` link in-repo but must be a real version in the published tarball. The
  rewrite touches only the checkout that gets packed — it is never committed, so
  local dev keeps the `file:` link. An exact pin is dist-tag-agnostic; the
  tradeoff is that a base bump needs the wrapper republished to pick it up.
- **Template stamp:** also before packing, [`stamp-template-versions.mjs`](../.github/scripts/stamp-template-versions.mjs)
  rewrites `create-veiller-miniapp`'s `template/package.json` `@veiller/*` pins to
  the **exact versions being published this run** (prerelease → exact, stable →
  caret). This is why a project scaffolded from *any* channel installs — see
  below. No-op for packages without a `template/`; never committed.
- **Guardrail:** the `latest` dist-tag (npm's default install) only ever ships
  from `main` — structurally, because only the main channel derives a plain
  version — and only after a maintainer approves the staged version.
- **Dry run:** `workflow_dispatch` defaults to `dry_run: true`, which builds and
  `npm pack --dry-run`s without publishing. Use it to validate the tarball
  contents before a real release.

### Cutting a release

1. On `dev`, bump the base `version` of the package(s) you're shipping:
   `0.4.0-dev.0`, `0.4.0-dev.1`, … CI publishes `0.4.0-dev.N` to the `dev` tag.
2. Merge `dev → staging`: CI stages `0.4.0-beta.N` for `beta` — approve it in
   the npm UI to go live. Nothing to edit.
3. Merge `staging → main`: CI stages `0.4.0` for `latest` — approve it in the
   npm UI to go live. Nothing to edit.
4. After a plain `0.4.0` has shipped, the base is **spent**: start the next
   cycle by bumping `dev` to `0.4.1-dev.0` (or `0.5.0-dev.0`). Until then,
   further merges to main are no-ops for that package.

## Publish order & the template stamp

`create-veiller-miniapp` bundles `template/package.json`, which pins
`@veiller/miniapp` and `@veiller/miniapp-cli`. In the repo these stay as friendly
caret ranges (`^0.3.0`) for readability — but a caret **excludes prereleases**,
so a project scaffolded from a dev/beta build (where only `0.3.0-dev.0` exists on
npm, no stable `0.3.0`) could never `bun install`.

The publish job fixes this automatically: `stamp-template-versions.mjs` rewrites
those pins to the **exact versions being published in the same run** before
packing. So `create-veiller-miniapp@dev` ships a template pinned to
`@veiller/miniapp@0.3.0-dev.0` (exact — installs regardless of dist-tag), and the
`latest` scaffolder ships `^<stable>`. Each channel's scaffolder is
self-consistent, and you never hand-edit the template for a release. The matrix
still publishes in dependency order so the pinned versions exist by the time a
scaffolded project installs them.

This is the publish-time-stamp pattern (à la `create-vite`): deterministic,
offline-safe, and no runtime registry call during scaffolding.

## The CLIs are Bun-only (settled)

`@veiller/miniapp-cli`, `create-veiller-miniapp`, and `@veiller/cli` ship **raw
`.ts` bins with `#!/usr/bin/env bun` shebangs** — there is no compile-to-JS step.
They run under `bun` / `bunx`, **not** `npx`/Node:

```bash
bunx create-veiller-miniapp my-app    # works
npx create-veiller-miniapp my-app     # fails — no Bun

bun add -g @veiller/cli@alpha         # works
npm i -g @veiller/cli                  # installs, but `veiller` needs Bun to run
```

This is a deliberate decision — the SDK/CLI stack is Bun-first, so the CLIs stay
Bun-only rather than adding a Node-compatible build. `@veiller/cli` declares
`"engines": { "bun": ">=1.0.0" }` to make the requirement explicit. Only the two
runtime/library packages are Node-compatible: `@veiller/miniapp` (compiled JS +
types) and `@veiller/auth` (compiled `dist/`). **Published docs must say `bunx` /
`bun` for anything that invokes a CLI.**

## ⚠️ `@veiller/cli` version collision (1.x latest vs 2.x prereleases)

`@veiller/cli@1.0.3` already sits on the `latest` tag on npm — that's the v1 CLI
(same maintainers, so we own the name). The Cloud V2 rewrite in
`cloud-v2/packages/cli` has base `2.0.0-dev.*`, so it ships to the `dev` and
`beta` channel tags. So:

- `npm i @veiller/cli` (or `bun add`) still resolves the old `1.0.3`.
- `bun add @veiller/cli@dev` (or `@beta`) gets the Cloud V2 CLI.

This holds until v2 is deliberately promoted: a `2.0.0` on `latest` (replacing
what every plain install resolves) requires its base to reach `main` and a
maintainer to **approve the staged version in the npm UI**. Approving it
promotes v2 over the legacy 1.0.3 — reject the staged version if that's not
intended yet.

## Manual publishing (fallback)

CI is the supported path. If you must publish by hand:

```bash
# 1. @veiller/miniapp  (build emits dist/)
cd mobile && bun install
cd modules/miniapp && bun run build
npm publish --tag <latest|beta|dev> --access public

# 2. @veiller/miniapp-cli
cd ../../../sdk && bun install
cd miniapp-cli
npm publish --tag <latest|beta|dev> --access public

# 3. create-veiller-miniapp  (after the two above are live)
cd ../create-veiller-miniapp
npm publish --tag <latest|beta|dev> --access public

# 4. @veiller/auth  (independent; compiled dist/)
cd ../../cloud-v2 && bun install
cd packages/auth && bun run build
npm publish --tag <alpha|dev|beta|latest> --access public

# 5. @veiller/cli  (LAST — after @veiller/miniapp-cli is live)
#    Rewrite its file: dep to the published miniapp-cli version first.
cd ../cli
node ../../../.github/scripts/rewrite-file-deps.mjs .
npm publish --tag dev --access public     # channel tag only; do NOT publish a bare 2.0.0
git checkout -- package.json               # undo the rewrite locally

# When publishing by hand for a non-dev channel, stamp the derived versions
# first (from the repo root): GITHUB_REF_NAME=<staging|main> \
#   node .github/scripts/stamp-channel-manifests.mjs
# then undo with: git checkout -- <the stamped package.json files>
```

You need `npm login` (or `NPM_TOKEN` in `~/.npmrc`) with `@veiller` publish
rights, and `bun` on PATH (the CLIs' bins run under Bun).
