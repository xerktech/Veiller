/**
 * Flip the latent per-account "this user is a developer" signal.
 *
 * `miniapp_dev_mode` controls whether the Miniapp Developer settings are
 * visible. Set it the first time someone actually loads a development miniapp
 * so the tools remain easy to reach afterward. Idempotent and cheap: once set,
 * it skips the write (and the server push) entirely.
 */
export function markMiniappDevMode(): void {
  // Foverlay: intentionally inert. This is a dedicated app — the miniapp
  // developer tools are removed, so nothing may re-latch dev mode (e.g. via
  // a scanned QR). Upstream set SETTINGS.miniapp_dev_mode here.
}
