package com.foverlay.tapinput

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
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

        @Volatile
        var isRunning = false
            private set

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

    private val sink: TapSink = { result, tapcode, repeat, timestampMs, source ->
        TapInputModule.emitTap(result, tapcode, repeat, timestampMs, source)
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "onCreate")
        startInForeground()

        fakeSource = FakeTapSource(this, sink).also { it.start() }

        // The real source needs BLUETOOTH_CONNECT (runtime permission on 12+).
        // Without it, run fake-only rather than crashing — the demo chain is
        // still fully exercisable over adb.
        if (hasBluetoothConnectPermission()) {
            try {
                realSource = RealTapSource(this, sink) { status, tapId ->
                    TapInputModule.emitStatus(status, tapId)
                }.also { it.start() }
            } catch (e: Exception) {
                // Defensive: a missing/odd BT stack shouldn't take down the service.
                Log.e(TAG, "Failed to start RealTapSource — continuing fake-only", e)
            }
        } else {
            Log.w(TAG, "BLUETOOTH_CONNECT not granted — RealTapSource disabled, fake-only")
        }
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        Log.i(TAG, "onDestroy")
        isRunning = false
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
