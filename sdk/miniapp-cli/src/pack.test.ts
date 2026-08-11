import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { pack } from './pack.js';

// `pack` produces the artifact that actually ships — the zip a developer
// uploads to a GitHub release and that the phone installs. It had no coverage
// at all, so a mutation to its output name or its bundle-contract checks went
// unnoticed by the whole suite.

let projectDir: string;

/** Minimal valid two-layer project: dist/ + a manifest that points into it. */
function scaffoldProject(overrides: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'veiller-pack-test-'));
  mkdirSync(join(dir, 'dist', 'background'), { recursive: true });
  mkdirSync(join(dir, 'dist', 'ui'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'background', 'index.js'), 'export default {}\n');
  writeFileSync(join(dir, 'dist', 'ui', 'index.html'), '<!doctype html><title>t</title>\n');
  writeFileSync(
    join(dir, 'miniapp.json'),
    JSON.stringify(
      {
        packageName: 'com.example.packtest',
        version: '1.0.0',
        name: 'Pack Test',
        entry: { background: 'background/index.js', ui: 'ui/index.html' },
        hardwareRequirements: [{ type: 'DISPLAY', level: 'REQUIRED' }],
        ...overrides,
      },
      null,
      2,
    ),
  );
  return dir;
}

async function zipEntries(zipPath: string): Promise<string[]> {
  // Read the central directory without shelling out, so the assertion does not
  // depend on `unzip` being installed.
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  return Object.keys(zip.files)
    .filter((n) => !n.endsWith('/'))
    .sort();
}

beforeEach(() => {
  projectDir = scaffoldProject();
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe('pack', () => {
  it('writes build/<packageName>-<version>.zip', async () => {
    const out = await pack({ cwd: projectDir, silent: true });

    expect(out).toBe(join(projectDir, 'build', 'com.example.packtest-1.0.0.zip'));
    expect(existsSync(out)).toBe(true);
  });

  it('includes the manifest alongside the built entries', async () => {
    const out = await pack({ cwd: projectDir, silent: true });

    // Flat bundle: miniapp.json must sit at the zip root, not under a
    // directory, or the phone's installer will not find it.
    expect(await zipEntries(out)).toEqual([
      'background/index.js',
      'miniapp.json',
      'ui/index.html',
    ]);
  });

  it('replaces the previous archive instead of adding to it', async () => {
    // `zip` appends by default. Repacking after a rebuild that renamed a
    // content-hashed chunk would otherwise keep the old chunk forever, growing
    // the shipped bundle and carrying dead code into the store.
    writeFileSync(join(projectDir, 'dist', 'ui', 'chunk-aaaa.js'), '// a\n');
    const first = await pack({ cwd: projectDir, silent: true });
    expect(await zipEntries(first)).toContain('ui/chunk-aaaa.js');

    rmSync(join(projectDir, 'dist', 'ui', 'chunk-aaaa.js'));
    writeFileSync(join(projectDir, 'dist', 'ui', 'chunk-bbbb.js'), '// b\n');
    const second = await pack({ cwd: projectDir, silent: true });

    const entries = await zipEntries(second);
    expect(entries).toContain('ui/chunk-bbbb.js');
    expect(entries).not.toContain('ui/chunk-aaaa.js');
  });

  it('self-ignores build/ so packed zips stay out of version control', async () => {
    await pack({ cwd: projectDir, silent: true });

    expect(readFileSync(join(projectDir, 'build', '.gitignore'), 'utf-8')).toBe('*\n');
  });

  it('honours outDir', async () => {
    const out = await pack({ cwd: projectDir, outDir: 'artifacts', silent: true });

    expect(out).toBe(join(projectDir, 'artifacts', 'com.example.packtest-1.0.0.zip'));
  });

  it('copies icon.png into the bundle when present', async () => {
    writeFileSync(join(projectDir, 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const out = await pack({ cwd: projectDir, silent: true });

    expect(await zipEntries(out)).toContain('icon.png');
  });
});

describe('pack — bundle contract', () => {
  // The rejection paths call process.exit(1), which would tear down the test
  // runner itself, so drive the CLI as a subprocess and assert on its exit
  // code and diagnostics — which is also how a developer meets these errors.
  const cliEntry = join(import.meta.dir, 'index.ts');

  async function runPack(cwd: string): Promise<{ code: number; stderr: string }> {
    const proc = Bun.spawn(['bun', cliEntry, 'pack', '--no-build'], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = await new Response(proc.stderr).text();
    return { code: await proc.exited, stderr };
  }

  it('refuses a manifest whose entry.background is missing from dist/', async () => {
    const dir = scaffoldProject({ entry: { background: 'background/nope.js' } });
    try {
      const { code, stderr } = await runPack(dir);
      expect(code).toBe(1);
      expect(stderr).toContain('entry.background');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a packageName that is not reverse-DNS', async () => {
    // packageName lands in a filesystem path both here and on the phone
    // (`lmas/<package>/<version>/`), so an unvalidated `../../escaped` writes
    // outside the project.
    const dir = scaffoldProject({ packageName: '../../ESCAPED' });
    try {
      const { code, stderr } = await runPack(dir);
      expect(code).toBe(1);
      expect(stderr).toContain('reverse-DNS');
      // and nothing was written above the project
      expect(existsSync(join(dir, '..', 'ESCAPED-1.0.0.zip'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a project with no dist/', async () => {
    const dir = scaffoldProject();
    rmSync(join(dir, 'dist'), { recursive: true, force: true });
    try {
      const { code, stderr } = await runPack(dir);
      expect(code).toBe(1);
      expect(stderr).toContain('dist/');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a project with no miniapp.json', async () => {
    const dir = scaffoldProject();
    rmSync(join(dir, 'miniapp.json'));
    try {
      const { code, stderr } = await runPack(dir);
      expect(code).toBe(1);
      expect(stderr).toContain('miniapp.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
