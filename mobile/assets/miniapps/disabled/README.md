# Parked miniapp bundles

Foverlay ships **no** miniapps inside the APK. Miniapps are installed at startup
from their repos' GitHub Releases, driven by the repo list in
`mobile/src/config/foverlayMiniapps.ts` (see XERK-214). Nothing in
`assets/miniapps/` is bundled or installed anymore.

Zips kept here are archival only:

- `com.mentra.livestreamer-1.0.15.zip` — parked per XERK-206 (only the Even
  Realities G2 and Tap Strap 2 are supported for now; livestreaming targets
  camera glasses). To ship it again, publish its bundle to a public GitHub
  release and add an entry to `foverlayMiniapps.ts`.
