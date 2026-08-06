/**
 * @fileoverview Re-export shim — the cloud-v2 secure credential store now lives
 * in @veiller/engine (island owns cloud-v2 credential storage). Kept so existing
 * `@/utils/cloudClient/MmkvSecureStore` imports resolve unchanged.
 */
export {cloudSecureStore} from "@veiller/engine/internal"
