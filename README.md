# Foverlay

Custom Android companion app for Even Realities G2 smart glasses, built as a
fork of [MentraOS](https://github.com/Mentra-Community/MentraOS) (MIT). Not
affiliated with Even Realities, Mentra, or Tap Systems.

**Foverlay is a dedicated app, not a platform** — the MentraOS miniapp/plugin
surfaces (store, installs, dev tooling) are stripped; features are implemented
natively in the host app.

**Current focus:** the Tap Strap 2 → G2 text echo — type with finger chords,
phone in pocket, letters appear on the glasses. See
[`docs/tap-strap-demo.md`](docs/tap-strap-demo.md) for architecture, adb-driven
testing without hardware, and the milestone checklist.

Agent/contributor context: [`CLAUDE.md`](CLAUDE.md). R1 ring reverse-engineering
notes (paused work): `docs/r1-ring-*.md`.

Foverlay-specific pieces on top of upstream:

- `mobile/modules/tap-input/` — Tap Strap 2 input (Controller Mode BLE, Kotlin
  foreground service, adb-driven fake source, unit-tested Tap alphabet).
- `mobile/modules/engine/src/services/TapTypingEchoService.ts` — the echo as a
  host engine service rendering straight to the glasses display.
- The miniapp product-strip and the Mapbox removal (no build secrets needed).
- `.github/workflows/release.yml` — the release pipeline (same model as the
  other xerktech repos): every merge to `main` touching `mobile/**` mints a
  `vX.Y.Z` tag and a GitHub Release with `foverlay-vX.Y.Z.apk` attached;
  root `VERSION` holds major.minor, minor/major bumps via workflow dispatch
  (dry-run rehearsal by default).

Build: `cd mobile && bun install && bun android` — use **bun 1.2.x** for
`mobile/` (1.3.x has a `file:` dep resolver regression there). No signing or
API secrets required.
