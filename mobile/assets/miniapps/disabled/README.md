# Disabled bundled miniapps

Zips in this folder are **excluded** from the app binary: the
`generate-bundled-miniapps.mjs` codegen only scans `assets/miniapps/` itself
(not subdirectories), so nothing here lands in `BUNDLED_MINIAPPS`.

- `com.mentra.livestreamer-1.0.15.zip` — parked per XERK-206 (only the Even
  Realities G2 and Tap Strap 2 are supported for now; livestreaming targets
  camera glasses). Move it back up one level and rebuild to restore it.
