# Veiller CLI

**Status:** Draft. Part of the Dev Toolkit (see ../README.md).

The Veiller CLI v2 is specified in
[`../../012-veiller-cli-v2/`](../../012-veiller-cli-v2/).

Direction:

- `@veiller/cli` owns the public `veiller` binary.
- `@veiller/miniapp-cli` or a split `@veiller/miniapp-tools` package provides
  reusable build/pack/dev helpers.
- Common miniapp scripts should stay short: `veiller dev`, `veiller build`,
  `veiller pack`, `veiller publish`.
