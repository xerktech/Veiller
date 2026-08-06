/**
 * Veiller-only compatibility entrypoint.
 *
 * Apps should import from `@veiller/bluetooth-sdk`. This is exported as
 * `@veiller/bluetooth-sdk/internal` only for Veiller packages that still need
 * the compatibility surface while the app is migrated onto the public SDK
 * surface.
 */
export {default} from "./_private/BluetoothSdkModule"
export type {BluetoothSdkInternalModule} from "./_private/BluetoothSdkModule"
export * from "./BluetoothSdk.types"
export {default as VeillerLocalNetwork} from "./_private/VeillerLocalNetworkModule"
export * from "./_private/VeillerLocalNetworkModule"
export {BLUETOOTH_SDK_VERSION, sdkPinnedOtaManifestUrl} from "./_private/sdkOtaManifest"
