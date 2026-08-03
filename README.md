# Foverlay

Custom Android companion app for Even Realities G2 smart glasses, built as a
fork of [MentraOS](https://github.com/Mentra-Community/MentraOS) (MIT). Not
affiliated with Even Realities, Mentra, or Tap Systems.

**Current focus:** the Tap Strap 2 → G2 text echo demo — type with finger
chords, phone in pocket, letters appear on the glasses. See
[`miniapps/tap-typing-demo/`](miniapps/tap-typing-demo/README.md) for how to
run it and [`docs/tap-strap-demo.md`](docs/tap-strap-demo.md) for the build
notes.

Agent/contributor context: [`CLAUDE.md`](CLAUDE.md). R1 ring reverse-engineering
notes (paused work): `docs/r1-ring-*.md`.

Foverlay-specific pieces on top of upstream:

- `mobile/modules/tap-input/` — Tap Strap 2 input (Controller Mode BLE, Kotlin
  foreground service, adb-driven fake source, unit-tested Tap alphabet).
- `miniapps/tap-typing-demo/` — the echo miniapp.
- Small typed additions to `@mentra/miniapp` + `@mentra/engine` for the
  `tap_input` event stream.

Upstream's own README/docs live in the fork history and at the upstream repo;
build instructions for the mobile app are in `mobile/AGENTS.md` (bun + Expo;
note: use bun 1.2.x to install `mobile/` — 1.3.x has a `file:` dep resolver
regression there).
