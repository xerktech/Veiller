package com.foverlay.tapinput

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.bluetooth.BluetoothManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Foreground service that owns the Tap Strap 2 connection, independent of the
 * MentraOS glasses ForegroundService (which owns the G2 BLE links).
 *
 * foregroundServiceType connectedDevice + START_STICKY is what keeps tap input
 * flowing with the screen off and the app backgrounded/Dozed.
 *
 * Both TapSources run for the whole service lifetime: the real SDK source
 * (inert until a paired Tap connects) and the adb-broadcast fake source
 * (inert until driven). Decoded events flow through one sink into
 * TapInputModule, which emits them to the React Native layer.
 *
 * BLE coexistence: the phone simultaneously holds GATT connections to the Tap
 * and to both G2 temple arms. Connection-interval contention is the flagged
 * risk for this build, so connect/disconnect transitions on the Tap side are
 * logged from day one (see RealTapSource status logging) to correlate against
 * G2 driver logs when debugging drops.
 */
class TapInputService : Service() {

    companion object {
        private const val TAG = "FoverlayTapService"
        private const val CHANNEL_ID = "FoverlayTapInputChannel"
        // Distinct from MentraOS's ForegroundService NOTIFICATION_ID (1001).
        private const val NOTIFICATION_ID = 2001
        private const val PERMISSION_POLL_MS = 10_000L

        @Volatile
        var isRunning = false
            private set

        @Volatile
        private var activeInstance: TapInputService? = null

        /** "stopped" | "running" | "no_permission" | "failed" — for the status card. */
        @Volatile
        var realSourceState = "stopped"
            private set

        /**
         * Names of OS-bonded Tap devices ("Tap_..."), whether or not the SDK
         * has connected them — lets the UI distinguish "not paired at all"
         * from "paired but not attaching". Empty when the service is down or
         * BLUETOOTH_CONNECT is missing.
         */
        fun bondedTapNames(): List<String> {
            val service = activeInstance ?: return emptyList()
            if (!service.hasBluetoothConnectPermission()) return emptyList()
            return try {
                val adapter = service.getSystemService(BluetoothManager::class.java)?.adapter
                adapter?.bondedDevices
                    ?.mapNotNull { it.name }
                    ?.filter { it.startsWith("Tap", ignoreCase = true) }
                    ?: emptyList()
            } catch (e: SecurityException) {
                Log.w(TAG, "bondedDevices denied", e)
                emptyList()
            }
        }

        /**
         * Inject one character through the live sink (UI "send test tap"
         * button). Returns false when the service isn't running.
         */
        fun injectChar(char: Char): Boolean {
            val service = activeInstance ?: return false
            val chord = TapAlphabet.encode(char) ?: return false
            val result = TapAlphabet.decode(chord.tapcode, chord.repeat)
            service.sink(result, chord.tapcode, chord.repeat, System.currentTimeMillis(), "test")
            return true
        }

        fun start(context: Context) {
            val intent = Intent(context, TapInputService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TapInputService::class.java))
        }
    }

    private var realSource: RealTapSource? = null
    private var fakeSource: FakeTapSource? = null
    private val handler = Handler(Looper.getMainLooper())

    /**
     * Self-heal for the permission latch: the BLUETOOTH_CONNECT check runs at
     * service creation, but on a fresh install the service starts BEFORE the
     * user grants Nearby devices — and a grant does not restart the process,
     * so a one-shot check would stick at "no_permission" forever. While the
     * real source is down for lack of permission, re-check every 10s and
     * start it the moment the grant lands.
     */
    private val permissionRetry = object : Runnable {
        override fun run() {
            if (realSource == null && hasBluetoothConnectPermission()) {
                Log.i(TAG, "BLUETOOTH_CONNECT granted after start — starting RealTapSource")
                startRealSource()
            }
            if (realSource == null && realSourceState == "no_permission") {
                handler.postDelayed(this, PERMISSION_POLL_MS)
            }
        }
    }

    private val sink: TapSink = { result, tapcode, repeat, timestampMs, source ->
        TapInputModule.emitTap(result, tapcode, repeat, timestampMs, source)
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "onCreate")
        activeInstance = this
        startInForeground()

        fakeSource = FakeTapSource(this, sink).also { it.start() }

        // The real source needs BLUETOOTH_CONNECT (runtime permission on 12+).
        // Without it, run fake-only rather than crashing — the demo chain is
        // still fully exercisable over adb — and keep polling for the grant.
        if (hasBluetoothConnectPermission()) {
            startRealSource()
        } else {
            Log.w(TAG, "BLUETOOTH_CONNECT not granted — RealTapSource disabled, polling for grant")
            realSourceState = "no_permission"
            handler.postDelayed(permissionRetry, PERMISSION_POLL_MS)
        }
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // start() is idempotent from the app's side; use each delivery as a
        // chance to recover from the no-permission state immediately.
        if (realSource == null && hasBluetoothConnectPermission()) {
            startRealSource()
        }
        return START_STICKY
    }

    private fun startRealSource() {
        if (realSource != null) return
        try {
            realSource = RealTapSource(this, sink) { status, tapId, mode ->
                TapInputModule.emitStatus(status, tapId, mode)
            }.also { it.start() }
            realSourceState = "running"
        } catch (e: Exception) {
            // Defensive: a missing/odd BT stack shouldn't take down the service.
            Log.e(TAG, "Failed to start RealTapSource — continuing fake-only", e)
            realSourceState = "failed"
        }
    }

    override fun onDestroy() {
        Log.i(TAG, "onDestroy")
        handler.removeCallbacksAndMessages(null)
        if (activeInstance === this) activeInstance = null
        isRunning = false
        realSourceState = "stopped"
        realSource?.stop()
        realSource = null
        fakeSource?.stop()
        fakeSource = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startInForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Tap input",
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = "Maintains the connection to the Tap Strap" }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Tap input active")
            .setContentText("Listening for Tap Strap chords")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // connectedDevice is satisfied by BLUETOOTH_CONNECT or by
            // CHANGE_NETWORK_STATE (install-time, can't be denied) — same
            // strategy as the MentraOS ForegroundService, avoiding the
            // dataSync fallback's 6-hour timeout on Android 14+.
            val canUseConnectedDevice = hasBluetoothConnectPermission() ||
                ContextCompat.checkSelfPermission(this, android.Manifest.permission.CHANGE_NETWORK_STATE) ==
                PackageManager.PERMISSION_GRANTED
            val type = if (canUseConnectedDevice) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            } else {
                Log.w(TAG, "Falling back to dataSync FGS type (6h timeout on Android 14+)")
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            }
            startForeground(NOTIFICATION_ID, notification, type)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun hasBluetoothConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.BLUETOOTH_CONNECT) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.BLUETOOTH) ==
                PackageManager.PERMISSION_GRANTED
        }
    }
}
