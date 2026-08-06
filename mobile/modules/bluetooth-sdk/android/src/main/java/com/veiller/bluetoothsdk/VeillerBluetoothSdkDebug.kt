package com.veiller.bluetoothsdk

object VeillerBluetoothSdkDebug {
    @JvmStatic
    fun setOtaVersionUrl(
        sdk: VeillerBluetoothSdk,
        otaVersionUrl: String,
    ) {
        sdk.setOtaVersionUrl(otaVersionUrl)
    }

    @JvmStatic
    fun getOtaVersionUrl(sdk: VeillerBluetoothSdk): String = sdk.getOtaVersionUrl()
}
