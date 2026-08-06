# Veiller Docs Roots

This repository has one Mintlify documentation root:

- `mintlify-docs/` is the Veiller documentation site for cloud Mini Apps, OS development, OEMs, cookbook content, and Mentra Live Bluetooth SDK docs.
- `mintlify-docs/mentra-live/` is the Veiller Bluetooth SDK documentation for mobile apps that connect directly to Mentra Live over Bluetooth.

Keep `mintlify-docs/mentra-live/` self-contained so changes can be transplanted onto `frozen-docs` with minimal conflicts. App Dev pages should link to `/mentra-live/overview` when camera, photo, streaming, or direct mobile Bluetooth control is the right path.

## Local Export

Export the Veiller docs:

```bash
cd mintlify-docs
bunx --bun mint export --output /tmp/mentraos-docs-export.zip
```

The Mentra Live tab is included in the same export.
