/**
 * Loading a miniapp the way the phone loads one: a flat bundle with
 * `miniapp.json` at the root, a background entry, and (optionally) a UI entry.
 *
 * Accepts either a packed `.zip` (what `veiller-miniapp pack` produces and what
 * ships on GitHub Releases) or an unpacked directory — a build output tree
 * works, which is what makes edit → re-run loops fast.
 */

import {existsSync, statSync} from "node:fs"
import {readFile, mkdtemp, mkdir, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join, resolve, sep} from "node:path"
import JSZip from "jszip"

export interface MiniappManifestPermission {
  type: string
  description?: string
}

export interface MiniappManifest {
  packageName: string
  version: string
  name: string
  description?: string
  entry?: {background?: string; ui?: string}
  permissions?: MiniappManifestPermission[]
  [key: string]: unknown
}

export interface LoadedBundle {
  manifest: MiniappManifest
  /** Absolute path to the directory the entry paths resolve against. */
  root: string
  /** Background bundle source. */
  backgroundCode: string
  /** Absolute path to the UI entry HTML, when the miniapp ships one. */
  uiEntry: string | null
  /**
   * Temp directory this load created by expanding a .zip, if any. The
   * Simulator removes it on stop() — otherwise every run of a packed bundle
   * left a full copy behind in /tmp forever.
   */
  tempRoot?: string
}

/** In order: the path itself, then the two conventional build-output children. */
function candidatesFor(path: string): string[] {
  return [path, join(path, "dist"), join(path, "build")]
}

export async function loadBundle(path: string): Promise<LoadedBundle> {
  const abs = resolve(path)
  if (!existsSync(abs)) throw new Error(`No such bundle: ${abs}`)

  const isDirectory = statSync(abs).isDirectory()
  const tempRoot = isDirectory ? undefined : await unpackZip(abs)
  const start = tempRoot ?? abs

  const manifestDir = candidatesFor(start).find((c) => existsSync(join(c, "miniapp.json")))
  if (!manifestDir) {
    throw new Error(
      `${abs} is not a miniapp bundle — expected miniapp.json at the root (or under dist/ or build/)`,
    )
  }
  const manifest = JSON.parse(await readFile(join(manifestDir, "miniapp.json"), "utf8")) as MiniappManifest

  // A packed bundle keeps the manifest next to its entries; a source checkout
  // keeps the manifest at the root and the built entries under dist/. Resolve
  // entries against whichever of those actually holds the background bundle,
  // so `simulate ./my-miniapp` works straight after `bun run build`.
  const backgroundEntry = manifest.entry?.background ?? "background/index.js"
  const root = candidatesFor(manifestDir).find((c) => existsSync(join(c, backgroundEntry)))
  if (!root) {
    throw new Error(
      `Manifest points at background entry "${backgroundEntry}", but it is not under ${manifestDir} (or its dist/ or build/). Has the miniapp been built?`,
    )
  }
  const backgroundCode = await readFile(join(root, backgroundEntry), "utf8")

  const uiEntryRel = manifest.entry?.ui
  const uiEntry = uiEntryRel && existsSync(join(root, uiEntryRel)) ? join(root, uiEntryRel) : null

  return {manifest, root: resolve(root), backgroundCode, uiEntry, ...(tempRoot ? {tempRoot} : {})}
}

/** A packed bundle: expand into a temp dir so the UI can be served from disk. */
async function unpackZip(zipPath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(zipPath))
  const dir = await mkdtemp(join(tmpdir(), "veiller-sim-"))
  const entries = Object.values(zip.files).filter((f) => !f.dir)
  for (const entry of entries) {
    const target = join(dir, entry.name)
    // Bundles are third-party input. JSZip normalises traversal segments
    // today, so this is belt-and-braces — but "an archive cannot write
    // outside its extraction root" should be enforced here, not inherited
    // from a dependency's current behaviour.
    const contained = resolve(target)
    if (contained !== resolve(dir) && !contained.startsWith(resolve(dir) + sep)) {
      throw new Error(`${zipPath} contains an entry that escapes the bundle root: ${entry.name}`)
    }
    await mkdir(dirname(target), {recursive: true})
    await writeFile(target, Buffer.from(await entry.async("arraybuffer")))
  }
  if (!existsSync(join(dir, "miniapp.json"))) {
    throw new Error(`${zipPath} is not a flat Veiller bundle — miniapp.json must be at the zip root`)
  }
  return dir
}
