# 006 Dev Toolkit

Umbrella issue for the developer-facing toolkit: the SDK and CLI miniapp
developers build against.

## Pieces (subfolders)

- [`local-sdk/`](./local-sdk/): the Veiller Local SDK (`@veiller/miniapp`), the API
  developers write miniapps against. Apps built with it run in the Veiller Runtime
  on-device. Existing spike.
- [`cli/`](./cli/): the Veiller CLI (`@veiller/miniapp-cli`), the build and publish
  tool.

## Related

- [`../001-cloud-core/`](../001-cloud-core/): dev-console-service and
  miniapp-service (publish and listing targets).
- [`../../veiller-overhaul-plan.md`](../../veiller-overhaul-plan.md)
