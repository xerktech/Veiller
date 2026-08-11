#!/usr/bin/env bun

import * as fs from 'fs';
import * as path from 'path';
import { intro, outro, text, select, isCancel, cancel, note } from '@clack/prompts';

type GlassesType = 'display' | 'camera';

interface CliFlags {
  projectName?: string;
  type?: GlassesType;
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {};
  for (const arg of argv) {
    if (arg.startsWith('--type=')) {
      const value = arg.slice('--type='.length);
      if (value === 'display' || value === 'camera') {
        flags.type = value;
      } else {
        console.error(`Invalid --type value: "${value}". Expected "display" or "camera".`);
        process.exit(1);
      }
    } else if (!arg.startsWith('-') && !flags.projectName) {
      flags.projectName = arg;
    }
  }
  return flags;
}

/**
 * Turn a project name into one reverse-DNS segment.
 *
 * `packageName` must match `^[a-zA-Z][a-zA-Z0-9_]*(\.…)+$` — the pattern in
 * miniapp.schema.json, which `validateManifest` now enforces too. Kebab-case is
 * *not* legal there: a dash makes the manifest the scaffolder just wrote fail
 * its own `$schema`, and `pack`/`dev`/`release` then reject the project on the
 * developer's first command. Project names accept dashes, spaces and a leading
 * digit (see validateProjectName), so all three have to be folded away here.
 */
function toPackageSegment(str: string): string {
  const segment = str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  // A segment must start with a letter; "2048" and "3d-viewer" otherwise
  // produce an identifier the schema rejects.
  return /^[a-z]/.test(segment) ? segment : `app_${segment}`;
}

function validateProjectName(name: string): string | undefined {
  if (!name.trim()) return 'Project name is required';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-_ ]*$/.test(name)) {
    return 'Use letters, numbers, dashes, underscores, or spaces (cannot start with a symbol)';
  }
  if (fs.existsSync(path.resolve(process.cwd(), name))) {
    return `Directory "${name}" already exists`;
  }
  return undefined;
}

function bailIfCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Cancelled.');
    process.exit(0);
  }
  return value as T;
}

const flags = parseArgs(process.argv.slice(2));

intro('create-veiller-miniapp');

let projectName = flags.projectName;
if (projectName) {
  const err = validateProjectName(projectName);
  if (err) {
    cancel(err);
    process.exit(1);
  }
} else {
  projectName = bailIfCancelled(
    await text({
      message: "What's your project name?",
      placeholder: 'my-miniapp',
      validate: validateProjectName,
    }),
  );
}

let glassesType = flags.type;
if (!glassesType) {
  glassesType = bailIfCancelled(
    await select<GlassesType>({
      message: 'What kind of glasses is this miniapp for?',
      options: [
        // XERK-206: the Even Realities G2 is the only supported display
        // device. Naming parked hardware here steers new developers at
        // targets this fork does not build for.
        {
          value: 'display',
          label: 'Display glasses',
          hint: 'Even Realities G2',
        },
        {
          value: 'camera',
          label: 'Camera glasses',
          hint: 'camera-equipped glasses (no supported device today)',
        },
      ],
    }),
  );
}

const targetDir = path.resolve(process.cwd(), projectName);
const templateDir = path.resolve(import.meta.dirname, '..', 'template');

const packageName = `com.veiller.${toPackageSegment(projectName)}`;
const hardwareRequirements =
  glassesType === 'camera'
    ? [
        { type: 'CAMERA', level: 'REQUIRED' },
        { type: 'MICROPHONE', level: 'REQUIRED' },
      ]
    : [
        { type: 'DISPLAY', level: 'REQUIRED' },
        { type: 'MICROPHONE', level: 'REQUIRED' },
      ];

const BINARY_TEMPLATE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp']);

function renderFile(srcPath: string, destPath: string): void {
  if (path.basename(srcPath) === 'miniapp.json') {
    const raw = fs.readFileSync(srcPath, 'utf-8');
    const manifest = JSON.parse(raw.replace(/\{\{packageName\}\}/g, packageName));
    manifest.hardwareRequirements = hardwareRequirements;
    fs.writeFileSync(destPath, JSON.stringify(manifest, null, 2) + '\n');
    return;
  }

  // Binary template assets (icon.png) must be copied byte-for-byte — reading
  // them as UTF-8 and writing the string back corrupts them.
  if (BINARY_TEMPLATE_EXTENSIONS.has(path.extname(srcPath).toLowerCase())) {
    fs.copyFileSync(srcPath, destPath);
    return;
  }

  const content = fs.readFileSync(srcPath, 'utf-8').replace(/\{\{packageName\}\}/g, packageName);
  fs.writeFileSync(destPath, content);
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    // npm strips literal `.gitignore` files on publish; the template
    // ships it as `_gitignore` instead and we rename on copy so the
    // scaffolded project starts with a proper `.gitignore`.
    const renamed = entry.name === '_gitignore' ? '.gitignore' : entry.name;
    const destPath = path.join(dest, renamed);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      renderFile(srcPath, destPath);
    }
  }
}

copyDir(templateDir, targetDir);

// Project names may contain spaces, so the copy-pasteable hint has to quote
// the directory or the very first command it suggests fails.
const cdTarget = /^[a-zA-Z0-9._-]+$/.test(projectName) ? projectName : `'${projectName.replace(/'/g, `'\\''`)}'`;

note(
  `cd ${cdTarget}\nbun install\nbun dev`,
  'Next steps',
);

outro(`Created miniapp in ./${projectName}`);
