package com.mentra.bluetoothsdk

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.tapwithus.sdk.TapListener
import com.tapwithus.sdk.TapSdk
import com.tapwithus.sdk.airmouse.AirMousePacket
import com.tapwithus.sdk.bluetooth.TapBluetoothManager
import com.tapwithus.sdk.mode.RawSensorData
import com.tapwithus.sdk.mode.TapInputMode
import com.tapwithus.sdk.mouse.MousePacket

/**
 * Tap Strap 2 support (https://www.tapwithus.com).
 *
 * A Tap Strap pairs to the phone as a regular Bluetooth HID keyboard/mouse. On top of
 * that HID link, the Tap exposes a BLE GATT service the official Tap SDK connects to;
 * once connected, the SDK can switch the strap between:
 *  - Text Mode (default): the strap types into the phone like any keyboard, and
 *  - Controller Mode: taps are delivered to the SDK as raw finger combinations and
 *    the strap stops producing keyboard input on the phone.
 *
 * "Takeover" here = keep every connected Tap in Controller Mode so the straps don't
 * interact with the phone at all while MentraOS owns them. Glasses control on top of
 * the received tap input is a follow-up (XERK-199 scopes to status + takeover only).
 *
 * Pairing itself stays in the phone's Bluetooth settings: paired straps are detected
 * from the bonded-device list by the "Tap_" name prefix Tap devices advertise with.
 * Status flows to JS as `tap_strap_status` events plus a pull via getStatus().
 */
object TapStrapManager {
    private const val TAG = "TapStrapManager"

    // Tap devices advertise as "Tap_XXX" (e.g. "Tap_C0FFEE"). Used only to recognize
    // paired-but-not-SDK-connected straps in the bonded list; SDK-connected taps are
    // GATT-verified and reported regardless of name.
    private const val TAP_NAME_PREFIX = "tap_"

    // Delay between switching straps back to Text Mode and dropping the GATT link on
    // takeover-off, so the mode write flushes before disconnect.
    private const val TEXT_MODE_FLUSH_DELAY_MS = 400L

    private val mainHandler = Handler(Looper.getMainLooper())

    private fun bluetoothAdapter(): BluetoothAdapter? =
            (Bridge.getContext().getSystemService(Context.BLUETOOTH_SERVICE) as?
                            android.bluetooth.BluetoothManager)
                    ?.adapter

    @Volatile private var sdk: TapSdk? = null
    @Volatile private var takeoverEnabled = false
    private val connectedTaps = mutableSetOf<String>()
    // Phone-level Bluetooth (ACL) links, tracked from broadcasts. This is the strap's
    // real connection to the phone (its keyboard HID link and/or our GATT link) and is
    // independent of whether the Tap SDK has taken the strap over.
    private val aclConnected = mutableSetOf<String>()
    private var receiverRegistered = false

    /** Idempotent; safe to call before any toggle. Registers the bond/ACL watchers. */
    fun init(context: Context) {
        registerDeviceReceiver(context)
    }

    /**
     * Live phone-link check for one device. BluetoothDevice.isConnected() is a
     * greylisted-but-stable hidden API (any-profile ACL truth, including links made
     * before we started listening); fall back to broadcast-tracked state without it.
     */
    private fun isDeviceConnected(device: BluetoothDevice): Boolean {
        try {
            val result = device.javaClass.getMethod("isConnected").invoke(device)
            if (result is Boolean) return result
        } catch (e: Exception) {
            Log.d(TAG, "isConnected reflection unavailable: ${e.message}")
        }
        return synchronized(aclConnected) { aclConnected.contains(device.address) }
    }

    fun getStatus(): Map<String, Any> {
        val connected = synchronized(connectedTaps) { connectedTaps.toSet() }
        val currentSdk = sdk

        // Paired straps from the bonded list (name heuristic), keyed by address.
        val taps = LinkedHashMap<String, HashMap<String, Any>>()
        var bluetoothPermission = true
        try {
            val adapter = bluetoothAdapter()
            for (device in adapter?.bondedDevices ?: emptySet()) {
                val name = device.name ?: continue
                if (!name.lowercase().startsWith(TAP_NAME_PREFIX)) continue
                taps[device.address] =
                        hashMapOf(
                                "name" to name,
                                "address" to device.address,
                                "connected" to isDeviceConnected(device),
                                "sdkConnected" to false,
                        )
            }
        } catch (e: SecurityException) {
            // BLUETOOTH_CONNECT not granted yet — report as no paired straps rather
            // than crashing; the app's normal permission flow covers the grant.
            bluetoothPermission = false
            Log.w(TAG, "getStatus: bluetooth permission missing", e)
        }

        // SDK-connected taps are authoritative: merge in even if the name filter missed
        // them, and attach battery/name details from the SDK cache when available.
        for (identifier in connected) {
            val entry =
                    taps.getOrPut(identifier) {
                        hashMapOf("name" to identifier, "address" to identifier)
                    }
            entry["connected"] = true
            entry["sdkConnected"] = true
            try {
                val cached = currentSdk?.getCachedTap(identifier)
                if (cached != null) {
                    if (!cached.name.isNullOrEmpty()) entry["name"] = cached.name
                    entry["battery"] = cached.battery
                }
            } catch (e: Exception) {
                Log.w(TAG, "getStatus: reading cached tap $identifier failed", e)
            }
        }

        return hashMapOf(
                "supported" to true,
                "takeoverEnabled" to takeoverEnabled,
                "bluetoothPermission" to bluetoothPermission,
                "taps" to taps.values.toList(),
        )
    }

    /**
     * Toggle MentraOS takeover of paired Tap Straps.
     *
     * On: bring up the Tap SDK (it auto-connects to every paired Tap) and hold every
     * strap in Controller Mode — no keyboard/mouse input reaches the phone.
     * Off: switch straps back to Text Mode, then release the SDK's GATT connections so
     * they behave as plain keyboards again.
     */
    fun setTakeoverEnabled(enabled: Boolean) {
        if (enabled == takeoverEnabled && (enabled == (sdk != null))) {
            emitStatus()
            return
        }
        takeoverEnabled = enabled
        if (enabled) {
            startSdk()
        } else {
            stopSdk()
        }
        emitStatus()
    }

    private fun startSdk() {
        if (sdk != null) return
        Bridge.log("TAP: enabling Tap Strap takeover (controller mode)")
        try {
            val bluetoothManager =
                    com.tapwithus.sdk.bluetooth.BluetoothManager(
                            Bridge.getContext().applicationContext,
                            bluetoothAdapter(),
                    )
            val newSdk = TapSdk(TapBluetoothManager(bluetoothManager))
            // Manual lifecycle: MentraOS keeps straps taken over while the toggle is on,
            // regardless of app foreground/background — don't auto-revert to Text Mode.
            newSdk.disablePauseResumeHandling()
            newSdk.setDefaultMode(TapInputMode.controller(), true)
            newSdk.registerTapListener(tapListener)
            sdk = newSdk
        } catch (e: Exception) {
            Log.e(TAG, "startSdk failed", e)
            Bridge.log("TAP: failed to start Tap SDK: ${e.message}")
            takeoverEnabled = false
        }
    }

    private fun stopSdk() {
        val currentSdk = sdk ?: return
        Bridge.log("TAP: disabling Tap Strap takeover (restoring keyboard mode)")
        sdk = null
        val toRestore = synchronized(connectedTaps) { connectedTaps.toList() }
        synchronized(connectedTaps) { connectedTaps.clear() }
        try {
            currentSdk.unregisterTapListener(tapListener)
            // Put straps back into Text Mode BEFORE dropping the GATT link — close()
            // alone leaves the mode switch to the strap's own disconnect fallback.
            currentSdk.setDefaultMode(TapInputMode.text(), true)
            for (identifier in toRestore) {
                currentSdk.startTextMode(identifier)
            }
        } catch (e: Exception) {
            Log.w(TAG, "stopSdk: restoring text mode failed", e)
        }
        mainHandler.postDelayed(
                {
                    try {
                        currentSdk.close()
                    } catch (e: Exception) {
                        Log.w(TAG, "stopSdk: close failed", e)
                    }
                },
                TEXT_MODE_FLUSH_DELAY_MS,
        )
    }

    private fun emitStatus() {
        Bridge.sendTypedMessage("tap_strap_status", getStatus())
    }

    /**
     * Keep the status card live: re-emit when a device pairs/unpairs in the phone's
     * Bluetooth settings, and track ACL connect/disconnect so the strap's real phone
     * link shows in real time (independent of the takeover toggle).
     */
    private fun registerDeviceReceiver(context: Context) {
        synchronized(this) {
            if (receiverRegistered) return
            receiverRegistered = true
        }
        try {
            val filter =
                    IntentFilter().apply {
                        addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
                        addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
                        addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
                    }
            context.applicationContext.registerReceiver(
                    object : BroadcastReceiver() {
                        override fun onReceive(context: Context, intent: Intent) {
                            val device: BluetoothDevice? =
                                    intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                            when (intent.action) {
                                BluetoothDevice.ACTION_ACL_CONNECTED,
                                BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                                    val address = device?.address ?: return
                                    val nowConnected =
                                            intent.action == BluetoothDevice.ACTION_ACL_CONNECTED
                                    synchronized(aclConnected) {
                                        if (nowConnected) aclConnected.add(address)
                                        else aclConnected.remove(address)
                                    }
                                    // Only Tap devices are worth an event; other BT traffic
                                    // (headphones etc.) shouldn't spam JS. Name read can
                                    // throw without BLUETOOTH_CONNECT — treat as non-Tap.
                                    val isTap =
                                            try {
                                                device.name?.lowercase()?.startsWith(TAP_NAME_PREFIX)
                                                        ?: false
                                            } catch (e: SecurityException) {
                                                false
                                            }
                                    if (isTap) emitStatus()
                                }
                                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> emitStatus()
                            }
                        }
                    },
                    filter,
            )
        } catch (e: Exception) {
            Log.w(TAG, "registerDeviceReceiver failed", e)
        }
    }

    private fun onTapConnectionChanged(identifier: String, connected: Boolean) {
        val changed =
                synchronized(connectedTaps) {
                    if (connected) connectedTaps.add(identifier) else connectedTaps.remove(identifier)
                }
        if (changed) {
            Bridge.log("TAP: tap $identifier ${if (connected) "connected" else "disconnected"}")
            emitStatus()
        }
    }

    private val tapListener =
            object : TapListener {
                override fun onBluetoothTurnedOn() {}

                override fun onBluetoothTurnedOff() {
                    val hadAny = synchronized(connectedTaps) { connectedTaps.isNotEmpty() }
                    synchronized(connectedTaps) { connectedTaps.clear() }
                    if (hadAny) emitStatus()
                }

                override fun onTapStartConnecting(tapIdentifier: String) {}

                override fun onTapConnected(tapIdentifier: String) {
                    onTapConnectionChanged(tapIdentifier, true)
                }

                override fun onTapDisconnected(tapIdentifier: String) {
                    onTapConnectionChanged(tapIdentifier, false)
                }

                override fun onTapResumed(tapIdentifier: String) {
                    onTapConnectionChanged(tapIdentifier, true)
                }

                override fun onTapChanged(tapIdentifier: String) {
                    emitStatus()
                }

                override fun onTapInputReceived(tapIdentifier: String, data: Int, repeatData: Int) {
                    // Glasses control from tap input is the XERK-199 follow-up; for now the
                    // input is only consumed so it never reaches the phone as keystrokes.
                }

                override fun onTapShiftSwitchReceived(tapIdentifier: String, data: Int) {}

                override fun onMouseInputReceived(tapIdentifier: String, data: MousePacket) {}

                override fun onAirMouseInputReceived(tapIdentifier: String, data: AirMousePacket) {}

                override fun onRawSensorInputReceived(tapIdentifier: String, rsData: RawSensorData) {}

                override fun onTapChangedState(tapIdentifier: String, state: Int) {}

                override fun onError(tapIdentifier: String, code: Int, description: String) {
                    Log.w(TAG, "Tap SDK error for $tapIdentifier: $code $description")
                    Bridge.log("TAP: error for $tapIdentifier: $code $description")
                }
            }
}
