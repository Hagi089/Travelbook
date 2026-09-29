package de.hagi089.travelbook.tracking

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import de.hagi089.travelbook.R

/**
 * Foreground Service der GPS-Aufnahme (Typ "location", dauerhafte Notification).
 *
 * Der Dienst kennt nur EINEN Befehl: "abgleichen". Er liest den Soll-Zustand aus dem [TrackingStore]
 * (recording / paused / keine aktive Aufnahme) und stellt sich darauf ein. Dadurch gilt dieselbe Logik
 * für Start, Pause, Fortsetzen, Stopp und den Neustart durch das System (START_STICKY, Intent = null).
 * Punkte werden direkt in den Store geschrieben, unabhängig davon, ob die WebView noch lebt.
 */
class TrackingService : Service() {

    private lateinit var store: TrackingStore
    private lateinit var client: FusedLocationProviderClient
    private var thread: HandlerThread? = null
    private var updating = false
    private var lastNotifyAt = 0L

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            var last: Location? = null
            for (loc in result.locations) {
                val accuracy = if (loc.hasAccuracy()) loc.accuracy.toDouble() else null
                if (store.append(loc.time, loc.latitude, loc.longitude, altitudeOf(loc), accuracy)) last = loc
            }
            if (last != null) maybeUpdateNotification(last)
        }
    }

    override fun onCreate() {
        super.onCreate()
        store = TrackingStore.get(this)
        client = LocationServices.getFusedLocationProviderClient(this)
        createChannel()
        running = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val rec = store.active()
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(rec, null), foregroundType())
        } catch (e: Exception) {
            // Android 12+/14+: Start aus dem Hintergrund oder fehlende Standortberechtigung. Die Aufnahme bleibt im Store
            // als aktiv stehen; beim nächsten Öffnen der App setzt TrackingPlugin sie mit neuem Segment fort.
            Log.w(TAG, "Foreground-Start abgelehnt", e)
            stopUpdates()
            stopSelf()
            return START_NOT_STICKY
        }
        if (rec == null) {
            stopUpdates()
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        if (rec.state == RecState.RECORDING) startUpdates(rec.profile) else stopUpdates()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // Bewusst kein onTaskRemoved: Wischen der App aus der Übersicht soll die Aufnahme nicht beenden.

    override fun onDestroy() {
        stopUpdates()
        running = false
        super.onDestroy()
    }

    @SuppressLint("MissingPermission") // Berechtigung wird vor dem Start im Plugin geprüft; SecurityException wird abgefangen.
    private fun startUpdates(profile: String) {
        if (updating) return
        val (intervalMs, minDistanceM) = when (profile) {
            "high" -> 1_000L to 0f
            "saver" -> 15_000L to 10f
            // "normal": 29.09.2026 nach Gerätetest von 5 s / 5 m auf 2 s / 3 m verdichtet (zu wenige Punkte). Werte sind
            // Annahmen und an echten Geräten zu prüfen (Punktedichte, Rauschen im Stand, Akkuverbrauch).
            else -> 2_000L to 3f
        }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateIntervalMillis(intervalMs)
            .setMinUpdateDistanceMeters(minDistanceM)
            .setWaitForAccurateLocation(false)
            .build()
        val t = HandlerThread("tracking-location").also { it.start() }
        try {
            client.requestLocationUpdates(request, callback, t.looper)
            thread = t
            updating = true
        } catch (e: SecurityException) {
            Log.w(TAG, "Standortberechtigung fehlt", e)
            t.quitSafely()
        }
    }

    private fun stopUpdates() {
        if (updating) client.removeLocationUpdates(callback)
        updating = false
        thread?.quitSafely()
        thread = null
    }

    private fun maybeUpdateNotification(last: Location) {
        val now = System.currentTimeMillis()
        if (now - lastNotifyAt < NOTIFY_INTERVAL_MS) return
        lastNotifyAt = now
        val rec = store.active() ?: return
        val accuracy = if (last.hasAccuracy()) last.accuracy else null
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(rec, accuracy))
    }

    private fun buildNotification(rec: Recording?, accuracyM: Float?): Notification {
        val paused = rec?.state == RecState.PAUSED
        val text = when {
            rec == null -> ""
            accuracyM != null -> "${rec.nextSeq} Punkte · ±${accuracyM.toInt()} m"
            else -> "${rec.nextSeq} Punkte"
        }
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(getString(if (paused) R.string.tracking_title_paused else R.string.tracking_title_recording))
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
        packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
            builder.setContentIntent(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        }
        if (rec != null && !paused) builder.setUsesChronometer(true).setWhen(rec.startedAt)
        return builder.build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL_ID, getString(R.string.tracking_channel_name), NotificationManager.IMPORTANCE_LOW)
        channel.description = getString(R.string.tracking_channel_description)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun foregroundType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0

    /** Höhe über Meeresspiegel (wie in GPX üblich), wo verfügbar; sonst Höhe über dem Ellipsoid (Unterschied: Geoidhöhe, bei Auf-/Abstieg unerheblich). */
    private fun altitudeOf(loc: Location): Double? = when {
        Build.VERSION.SDK_INT >= 34 && loc.hasMslAltitude() -> loc.mslAltitudeMeters
        loc.hasAltitude() -> loc.altitude
        else -> null
    }

    companion object {
        private const val TAG = "TrackingService"
        private const val CHANNEL_ID = "tracking"
        private const val NOTIFICATION_ID = 4711
        private const val NOTIFY_INTERVAL_MS = 10_000L

        /** true, solange der Dienst läuft. Nur für den Abgleich im Plugin. */
        @Volatile
        var running = false
            private set

        /** Bringt den Dienst auf den Soll-Zustand aus dem Store. Nur aus sichtbarer App aufrufen (Android 12+/14+). */
        fun sync(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, TrackingService::class.java))
        }
    }
}
