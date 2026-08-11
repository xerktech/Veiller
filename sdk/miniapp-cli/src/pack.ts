import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { buildProduction } from './build.js';
import { validateManifest } from './manifest.js';

export interface PackOptions {
  /** Miniapp project root. Defaults to the current working directory. */
  cwd?: string;
  /** Run the production build before zipping. Defaults to false. */
  build?: boolean;
  /** Where to write the resulting zip. Defaults to build/. */
  outDir?: string;
  /** Quiet stdout. The `release` command swallows pack output and prints
   * its own progress; standalone `pack` calls leave it on. */
  silent?: boolean;
}

/**
 * Validate manifest, copy manifest+icon into dist/, zip dist/ into
 * `build/<packageName>-<version>.zip`. Returns the absolute path of the zip.
 *
 * `build/` is self-ignoring: a `.gitignore` containing `*` is written into
 * it on creation (the Cargo `target/` trick), so packed zips stay out of
 * version control no matter which repo the miniapp lives in — no root
 * .gitignore coordination needed.
 */
export async function pack(opts: PackOptions = {}): Promise<string> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  if (opts.build) {
    await buildProduction(cwd);
  }

  const distDir = resolve(cwd, 'dist');
  const manifestSrc = resolve(cwd, 'miniapp.json');
  const iconSrc = resolve(cwd, 'icon.png');

  // Verify dist/ exists
  if (!existsSync(distDir)) {
    console.error('Error: dist/ directory not found. Build your miniapp first.');
    process.exit(1);
  }

  // Verify miniapp.json exists
  if (!existsSync(manifestSrc)) {
    console.error('Error: miniapp.json not found in current directory');
    process.exit(1);
  }

  // Read and validate manifest
  const manifestRaw = readFileSync(manifestSrc, 'utf-8');
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    console.error('Error: miniapp.json is not valid JSON');
    process.exit(1);
  }

  const { valid, errors } = validateManifest(manifest);
  if (!valid) {
    console.error('Manifest validation failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  // Enforce two-layer bundle contract when manifest.entry is set.
  // `entry.background` (required for two-layer) must resolve to a file in the
  // bundle. `entry.ui` (optional, for UI-bearing miniapps) likewise. Legacy
  // single-bundle manifests without an `entry` object skip this check —
  // pack still zips dist/ verbatim.
  //
  // Entry paths are relative to the *bundle root*, which is dist/'s contents
  // (we zip from inside dist/ below), so `background/index.js` in the manifest
  // is `dist/background/index.js` on disk — resolve against distDir.
  const entry = manifest.entry as {background?: string; ui?: string} | undefined;
  if (entry) {
    const checkRelative = (label: string, rel: string | undefined, required: boolean) => {
      if (!rel) {
        if (required) {
          console.error(`Error: manifest.entry.${label} is required for two-layer bundles`);
          process.exit(1);
        }
        return;
      }
      const abs = resolve(distDir, rel);
      if (!existsSync(abs)) {
        console.error(`Error: manifest.entry.${label} points at "${rel}" but dist/${rel} does not exist`);
        process.exit(1);
      }
    };
    checkRelative('background', entry.background, true);
    checkRelative('ui', entry.ui, false);
  }

  // Copy miniapp.json into dist/
  copyFileSync(manifestSrc, join(distDir, 'miniapp.json'));

  // Copy icon.png into dist/ if it exists
  if (existsSync(iconSrc)) {
    copyFileSync(iconSrc, join(distDir, 'icon.png'));
  } else if (!opts.silent) {
    console.warn('Warning: icon.png not found in project root, skipping');
  }

  const packageName = manifest.packageName as string;
  const version = manifest.version as string;

  // The store records the version from the bundle filename, so a manifest
  // version that has drifted from package.json ships a bundle labelled with a
  // version the project does not think it is on (XERK-225). Warn rather than
  // fail — miniapp.json is the authority, and some projects deliberately keep
  // package.json at 0.0.0 — but do not let the drift pass silently.
  const packageJsonPath = resolve(cwd, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkgVersion = JSON.parse(readFileSync(packageJsonPath, 'utf-8')).version;
      if (typeof pkgVersion === 'string' && pkgVersion && pkgVersion !== version) {
        console.warn(
          `Warning: miniapp.json version (${version}) does not match package.json version (${pkgVersion}).\n` +
            `         The bundle will be published as ${packageName}-${version}.zip and installed as ${version}.`,
        );
      }
    } catch {
      // A miniapp does not need a readable package.json; ignore.
    }
  }

  const outputName = `${packageName}-${version}.zip`;
  const outDir = resolve(cwd, opts.outDir ?? 'build');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const selfIgnore = join(outDir, '.gitignore');
  if (!existsSync(selfIgnore)) {
    writeFileSync(selfIgnore, '*\n');
  }
  const outputPath = resolve(outDir, outputName);

  // `zip` *adds to* an existing archive rather than replacing it, so repacking
  // the same version after a rebuild would keep every stale content-hashed
  // chunk forever — the shipped bundle grows on each pack and carries dead
  // code. Start from a clean archive every time.
  if (existsSync(outputPath)) {
    unlinkSync(outputPath);
  }

  // Create ZIP using system zip command
  let zipProc;
  try {
    zipProc = Bun.spawn(['zip', '-r', outputPath, '.'], {
      cwd: distDir,
      stdout: opts.silent ? 'pipe' : 'inherit',
      stderr: opts.silent ? 'pipe' : 'inherit',
    });
  } catch {
    // Bun throws rather than returning a non-zero exit when the binary is
    // missing entirely. A raw stack trace here reads as a CLI bug; say what
    // is actually missing instead.
    console.error(
      'Error: `zip` is required to pack a miniapp but was not found on PATH.\n' +
        '  Debian/Ubuntu: apt-get install zip\n' +
        '  macOS:         zip ships with the OS\n' +
        '  Alpine:        apk add zip',
    );
    process.exit(1);
  }

  const exitCode = await zipProc.exited;
  if (exitCode !== 0) {
    console.error('Error: zip command failed');
    process.exit(1);
  }

  if (!opts.silent) {
    console.log(`\nPacked: ${outputPath}`);
  }
  return outputPath;
}
