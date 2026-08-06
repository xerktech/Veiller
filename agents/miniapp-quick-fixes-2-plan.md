# Permission/Hardware CLI — Implementation Sketch

Implementation sketch for section #2 of [`miniapp-quick-fixes-spec.md`](./miniapp-quick-fixes-spec.md). Lighter than a full plan — the spec has the user-visible behavior locked. This doc just nails down the file layout and helper names so the object-verb subcommands and the interactive wizard can share a backend.

---

## File layout

```
sdk/miniapp-cli/src/
├── manifest.ts            # existing — validateManifest, allowed-value constants
├── manifest-mutate.ts     # NEW — pure mutation helpers
├── manifest-format.ts     # NEW — write helpers (preserve indent, atomic write)
├── permission.ts          # NEW — `permission` subcommand handlers
├── hardware.ts            # NEW — `hardware` subcommand handlers
├── manifest-wizard.ts     # NEW — `manifest` interactive wizard
└── index.ts               # existing — switch on subcommand, dispatch
```

Three new modules grouping concerns: pure data mutation (`manifest-mutate`), file I/O (`manifest-format`), CLI surfaces (`permission`, `hardware`, `manifest-wizard`). Wizard and subcommands share `manifest-mutate` + `manifest-format`.

---

## `manifest-mutate.ts` — pure helpers

No I/O. Operates on parsed manifest objects, returns new objects (immutable). Easy to unit-test.

```ts
addPermission(m: Manifest, type: AllowedPermission, opts?: {description?: string; required?: boolean}): Manifest
removePermission(m: Manifest, type: AllowedPermission): Manifest
addHardware(m: Manifest, type: AllowedHardwareType, level: AllowedHardwareLevel, opts?: {description?: string}): Manifest
removeHardware(m: Manifest, type: AllowedHardwareType): Manifest
listPermissions(m: Manifest): ManifestPermission[]
listHardware(m: Manifest): ManifestHardwareRequirement[]

// Validation helper used by all add* methods:
closestAllowedValue<T extends string>(input: string, allowed: readonly T[]): T | null
// Levenshtein distance ≤ 2; returns null if nothing close
```

All `add*` methods throw `ManifestMutateError` with code:
- `"unknown_type"` — input type isn't in allowed list. Includes `closestMatch` field.
- `"duplicate"` — type already present in array.
- `"invalid_level"` — for hardware only; level not REQUIRED/OPTIONAL.

Errors contain the message strings the CLI prints — surface logic doesn't reformat.

---

## `manifest-format.ts` — file I/O

```ts
loadManifest(cwd: string): Result<{path: string; raw: string; manifest: Manifest}, ManifestLoadError>
writeManifest(path: string, manifest: Manifest): Result<void, ManifestWriteError>
```

`loadManifest`:
- Looks for `miniapp.json` in `cwd`.
- Returns `{code: "not_found", path}` if missing.
- Returns `{code: "parse_error", path, line, column, message}` if invalid JSON.
- Returns `{path, raw, manifest}` on success.

`writeManifest`:
- `JSON.stringify(manifest, null, 2)` — preserves 2-space indentation.
- Atomic write: write to `miniapp.json.tmp`, then rename.
- No comment preservation. miniapp.json is pure JSON, not JSONC.

---

## `permission.ts` — object-verb subcommand

```bash
veiller-miniapp permission list
veiller-miniapp permission add               # interactive: prompt for type
veiller-miniapp permission add MICROPHONE    # non-interactive
veiller-miniapp permission remove MICROPHONE
```

Each entry function:

```ts
async function listPermissionsCmd(): Promise<void>
async function addPermissionCmd(typeArg?: string): Promise<void>
async function removePermissionCmd(typeArg: string): Promise<void>
```

Flow for `addPermissionCmd`:
1. `loadManifest(cwd)` — handle errors, exit 1 with helpful message.
2. If `typeArg` not given: `clack.select({options: ALLOWED_PERMISSIONS.map(p => ({value: p, label: p}))})`. Optional `clack.text` for description.
3. If `typeArg` given: validate via `closestAllowedValue`. If unknown: print `"unknown permission \"$typeArg\". Did you mean \"<closest>\"?"` and exit 1.
4. `addPermission(manifest, type, opts)`. Catch `ManifestMutateError`:
   - `"duplicate"`: print `"$type already declared. Use 'permission remove $type' first if you want to update its description."` and exit 1.
5. `writeManifest(path, mutated)`.
6. Print resulting permission list and any `validateManifest` warnings.

Flow for `removePermissionCmd`: same shape; reject if not present.

Flow for `listPermissionsCmd`: load, print as table.

Hardware module mirrors the structure (`hardware.ts`):
```bash
veiller-miniapp hardware list
veiller-miniapp hardware add               # interactive: type then level
veiller-miniapp hardware add CAMERA REQUIRED
veiller-miniapp hardware remove CAMERA
```

---

## `manifest-wizard.ts` — interactive top-level

```bash
veiller-miniapp manifest
```

Single entry: `runManifestWizard()`. Built on `@clack/prompts`.

Prompt sequence (intro, then a top-level loop):

```
intro: "Veiller miniapp manifest editor"

[load manifest, error out cleanly if invalid]

loop:
  select: "What would you like to do?"
    options:
      - "Edit permissions"
      - "Edit hardware requirements"
      - "Show current manifest"
      - "Done"
  
  if "Edit permissions":
    select: "Add or remove?"
      options: ["Add a permission", "Remove a permission", "Back"]
    
    if "Add":
      multiselect: "Which permission(s)?" (prompts for multi-add)
        options: ALLOWED_PERMISSIONS.map(p => ({value: p, label: p, hint: descriptionForPermission(p)}))
      for each selected:
        text: "Description (optional)"
        addPermission(...)
      
    if "Remove":
      select: "Which permission to remove?"
        options: current permissions
      removePermission(...)
  
  if "Edit hardware requirements":
    [same shape as permissions but with level prompt after type]
  
  if "Show current manifest":
    [print full manifest as JSON, syntax-highlighted if possible]

on "Done":
  outro: "Saved miniapp.json. ✨"
```

`descriptionForPermission(type)` returns helpful one-liners:
- `MICROPHONE`: "Required for transcription, audio recording, voice activity detection"
- `CAMERA`: "Required for taking photos via session.camera.takePhoto()"
- ...

These hints come from a small constant map in `manifest-wizard.ts`. Keeps the wizard educational without bloating `manifest.ts` with UX strings.

Wizard mutations call the same `addPermission` / `removePermission` helpers. After every mutation, persist immediately (don't batch — if the user Ctrl-C's mid-wizard, partial changes are saved).

---

## `index.ts` dispatch update

```ts
switch (subcommand) {
  case "dev": ...
  case "pack": ...
  case "permission": {
    const action = process.argv[3]
    if (action === "list") await listPermissionsCmd()
    else if (action === "add") await addPermissionCmd(process.argv[4])
    else if (action === "remove") await removePermissionCmd(process.argv[4])
    else printUsage("permission")
    break
  }
  case "hardware": {
    const action = process.argv[3]
    if (action === "list") await listHardwareCmd()
    else if (action === "add") await addHardwareCmd(process.argv[4], process.argv[5])
    else if (action === "remove") await removeHardwareCmd(process.argv[4])
    else printUsage("hardware")
    break
  }
  case "manifest": await runManifestWizard(); break
  default: printUsage()
}
```

`printUsage()` updated to list the new subcommands.

---

## Output formatting

All `list` and post-mutation prints use the same shape:

```
Permissions (3):
  • MICROPHONE — Used for live transcription
  • LOCATION — Exercised by the SDK Tester page
  • CALENDAR — Exercised by the SDK Tester page

Hardware requirements (2):
  • DISPLAY (REQUIRED) — Shows live transcription
  • MICROPHONE (REQUIRED) — Captures speech for transcription
```

Empty arrays show `Permissions: none declared.`

Error formatting uses red color via clack's built-in.

---

## Tests

Add to `sdk/miniapp-cli/src/manifest-mutate.test.ts`:
- Add unknown permission → throws `unknown_type` with closest-match suggestion.
- Add duplicate → throws `duplicate`.
- Add valid → array contains entry.
- Remove non-existent → throws `not_present`.
- Remove existing → array shrinks.
- Hardware: invalid level → throws `invalid_level`.
- Levenshtein: `"MICRPHONE"` → `"MICROPHONE"`.

Existing `manifest.test.ts` covers `validateManifest`; don't duplicate.

CLI surface tests are integration-flavored — run the binary with stub stdin, assert file output. Skip for V1 unless something breaks.

---

## Sequencing

1. `manifest-mutate.ts` + tests.
2. `manifest-format.ts`.
3. `permission.ts` and `hardware.ts` (parallel — same shape).
4. `manifest-wizard.ts`.
5. `index.ts` dispatch.

Estimated 2-3 days. Steps 1-2 land first as a separate small commit; remainder as one.

---

## Open during implementation

- Whether `veiller-miniapp manifest` should also offer to edit `name` / `description` / `version` (the non-array manifest fields). V1: no — keep wizard scoped to permissions and hardware, which is where the friction is. Editing name/version is fine to do in an editor.
- Whether to add a `veiller-miniapp permission required MICROPHONE` flag toggle for the rare case of changing the `required` boolean without removing-and-re-adding. V1: skip — re-add is fine.
- Whether the wizard's "Show current manifest" should pretty-print with colors. V1: plain JSON; clack doesn't natively color it.

Defer all three; resolve during work.
