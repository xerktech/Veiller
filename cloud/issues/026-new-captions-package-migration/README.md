# New Captions Package Migration

Migrate from `com.augmentos.livecaptions` to `com.veiller.captions`.

## Quick Context

**Current**: Old captions app `com.augmentos.livecaptions` is hardcoded in cloud and store.
**Proposed**: Replace with new `com.veiller.captions` package.

## Key Context

The new captions app `com.veiller.captions` has been deployed and added to prod server env vars. This hotfix removes hardcoded references to the old package name.

## Changes

### Production Code

| File                                              | Change                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/cloud/src/services/core/app.service.ts` | Removed `com.augmentos.livecaptions` from `PRE_INSTALLED` (now configured via env vars) |

### Store Frontend

| File                                          | Change                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `websites/store/src/components/ui/slides.tsx` | Updated 3 references from `com.augmentos.livecaptions` → `com.veiller.captions` |

## Not Changed (Intentionally)

- **Historical issue docs** (`cloud/issues/complete/*`, `cloud/issues/004-*`, etc.) - Left as historical reference
- **Test files** (`cloud/packages/cloud-client/src/examples/*`) - Potentially deprecated, out of scope
- **Porter test workflows** (`.github/workflows/*live-captions*`) - Currently broken/disabled, out of scope
- **`app-uptime.service.ts`** - Currently disabled, not urgent

## Status

- [x] Remove from `PRE_INSTALLED` in `app.service.ts`
- [x] Update store slides to use `com.veiller.captions`
- [ ] Verify store displays correctly
- [ ] Deploy to prod
