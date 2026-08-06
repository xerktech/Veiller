/**
 * Compile-time test for the two-layer SDK split.
 *
 * The package exports two sub-paths with distinct type-roots:
 *   - `@veiller/miniapp/background` exposes `MiniappSession` + module
 *     types; it does NOT declare the `veiller` global.
 *   - `@veiller/miniapp/ui` exposes the `VeillerUiGlobal` / `VeillerTyped`
 *     types + React adapters. It deliberately does NOT declare a
 *     `var veiller` on `globalThis` — that would lock every consumer
 *     into the SDK's default `Record<string, unknown>` channel shape
 *     and break per-miniapp `Channels` registries via TS's `var`
 *     declaration-merging rules. Each miniapp declares its own typed
 *     `var veiller: VeillerTyped<MyChannels>` in `shared/channels.ts`.
 *
 * Wrong-layer imports should be caught at compile time. This file is
 * type-only (`.test-d.ts`) — no runtime assertions. `bun typecheck` /
 * `bun x tsc -p tsconfig.json` is the executor.
 *
 * NOTE: this file lives inside `src/` so it ships with the package and
 * downstream consumers' typechecks would also catch a regression. The
 * `@ts-expect-error` lines fail the build if the named symbol *does*
 * become reachable on the wrong path, which is the contract we want.
 */

// ----- @veiller/miniapp/background ---------------------------------------
import {registerMiniapp} from "./background/index"
import type {MiniappSession, UIModule} from "./background/index"

// ✅ MiniappSession is reachable from the background entry.
const _bg: MiniappSession | undefined = undefined
void _bg

// ✅ registerMiniapp<Channels> carries the shared channel registry into
//    session.ui on the background side.
interface _TestChannels {
  ping: {at: number}
}
type _RegisteredHandler = Parameters<typeof registerMiniapp<_TestChannels>>[0]
type _RegisteredSession = Parameters<_RegisteredHandler>[0]
type _Assert<T extends true> = T
export type _TypedBackground = _Assert<_RegisteredSession["ui"] extends UIModule<_TestChannels> ? true : false>

// ----- @veiller/miniapp/ui -----------------------------------------------
import type {VeillerUiGlobal, VeillerTyped} from "./ui/index"

// ✅ VeillerUiGlobal is reachable from the ui entry.
const _ui: VeillerUiGlobal | undefined = undefined
void _ui

// ✅ VeillerTyped<TChannels> is the canonical way to type the global.
//    Consumers do `declare global { var veiller: VeillerTyped<Channels> }`
//    inside their own code; the SDK no longer ships the declaration.
export type _Typed = VeillerTyped<{foo: number}>

// ----- compile-time guardrails ------------------------------------------
// (TypeScript doesn't ship a `// @ts-expect-no-error` mirror, so we just
// rely on the named imports above failing if the corresponding files
// disappear. The asymmetric exports are enforced by package.json's
// `exports` map at consumer time; this file proves the source files
// expose what they should.)
