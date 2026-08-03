/**
 * Build script — background bundle only (this miniapp has no UI WebView).
 *
 * dist/background/index.js is the JSContext entry. JSC + Zipline/QuickJS
 * evaluate it as a classic script, so ESM `export` keywords are syntax errors
 * there; we emit an IIFE and bundle `@mentra/miniapp/background` in (the
 * JSContext has no module resolver). Same shape as miniapps/captions/build.ts
 * minus the UI pass.
 */

import {rm} from "fs/promises"

const distDir = "./dist"

await rm(distDir, {recursive: true, force: true})

const backgroundResult = await Bun.build({
  entrypoints: ["./src/background/index.ts"],
  outdir: `${distDir}/background`,
  target: "browser",
  format: "iife",
  minify: false,
})
if (!backgroundResult.success) {
  console.error("Background build failed:")
  for (const log of backgroundResult.logs) console.error(log)
  process.exit(1)
}

console.log("built tap-typing-demo -> dist/background/index.js")
