import Foundation

@MainActor
public enum VeillerBluetoothSDKDebug {
    public static func setOtaVersionUrl(_ otaVersionUrl: String, on sdk: VeillerBluetoothSDK) throws {
        try sdk.setOtaVersionUrl(otaVersionUrl)
    }

    public static func getOtaVersionUrl(on sdk: VeillerBluetoothSDK) throws -> String {
        try sdk.getOtaVersionUrl()
    }
}
