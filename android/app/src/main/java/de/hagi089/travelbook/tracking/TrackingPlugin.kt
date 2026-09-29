package de.hagi089.travelbook.tracking

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

/**
 * Capacitor-Plugin "Tracking": Schnittstelle zur Web-Oberfläche (siehe src/tracking/types.ts).
 * Alle Aufzeichnungsdaten liegen im [TrackingStore]; der [TrackingService] schreibt dort hinein.
 */
@CapacitorPlugin(
    name = "Tracking",
    permissions = [
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION], alias = "location"),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
    ],
)
class TrackingPlugin : Plugin() {

    private val store: TrackingStore get() = TrackingStore.get(context)
    private val prefs get() = context.getSharedPreferences("tracking_plugin", Context.MODE_PRIVATE)

    // ---- Aufnahme ----

    @PluginMethod
    fun start(call: PluginCall) {
        val id = call.getString("recordingId")
        if (id.isNullOrBlank()) return call.reject("recordingId fehlt.")
        val profile = call.getString("profile") ?: "normal"
        if (!hasFineLocation()) return call.reject("Standortberechtigung fehlt.")
        try {
            store.begin(id, profile, System.currentTimeMillis())
        } catch (e: Exception) {
            return call.reject(e.message ?: "Start nicht möglich.")
        }
        TrackingService.sync(context)
        call.resolve(status())
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        if (store.pause() == null) return call.reject("Keine laufende Aufnahme.")
        TrackingService.sync(context)
        call.resolve(status())
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        val cur = store.active()
        if (cur == null || cur.state != RecState.PAUSED) return call.reject("Die Aufnahme ist nicht pausiert.")
        store.resume()
        TrackingService.sync(context)
        call.resolve(status())
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        store.stop()
        TrackingService.sync(context)
        call.resolve(status())
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        // Wurde der Dienst vom System beendet, obwohl die Aufnahme als "recording" gilt, läuft er hier wieder an
        // (die App ist jetzt sichtbar, der Start ist erlaubt). Die Lücke wird durch ein neues Segment gekennzeichnet.
        val rec = store.active()
        if (rec != null && rec.state == RecState.RECORDING && !TrackingService.running && hasFineLocation()) {
            store.pause()
            store.resume() // segment + 1
            TrackingService.sync(context)
        }
        call.resolve(status())
    }

    // ---- Punkte übergeben ----

    @PluginMethod
    fun getPendingPoints(call: PluginCall) {
        val id = call.getString("recordingId") ?: return call.reject("recordingId fehlt.")
        val limit = (call.getInt("limit") ?: 500).coerceIn(1, 5000)
        val arr = JSArray()
        for (p in store.pending(id, limit)) {
            arr.put(
                JSObject().apply {
                    put("seq", p.seq)
                    put("segment", p.segment)
                    put("time", p.time)
                    put("lat", p.lat)
                    put("lon", p.lon)
                    put("ele", p.ele ?: JSONObject.NULL)
                    put("accuracy", p.accuracy ?: JSONObject.NULL)
                },
            )
        }
        call.resolve(JSObject().put("points", arr))
    }

    @PluginMethod
    fun ackPoints(call: PluginCall) {
        val id = call.getString("recordingId") ?: return call.reject("recordingId fehlt.")
        val upTo = call.getInt("upToSeq") ?: return call.reject("upToSeq fehlt.")
        store.ack(id, upTo)
        call.resolve()
    }

    // ---- Berechtigungen und Einstellungen ----

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        call.resolve(permissionsJson())
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        val aliases = mutableListOf("location")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) aliases.add("notifications")
        prefs.edit().putBoolean("asked_location", true).apply()
        requestPermissionForAliases(aliases.toTypedArray(), call, "permissionsCallback")
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        call.resolve(permissionsJson())
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    // ---- Hilfen ----

    private fun hasFineLocation(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun permissionsJson(): JSObject {
        val location = when {
            hasFineLocation() -> "granted"
            prefs.getBoolean("asked_location", false) -> "denied"
            else -> "prompt"
        }
        val notifications = when {
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU -> "granted" // vor Android 13 keine Laufzeitberechtigung nötig
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED -> "granted"
            prefs.getBoolean("asked_location", false) -> "denied"
            else -> "prompt"
        }
        return JSObject().put("location", location).put("notifications", notifications)
    }

    private fun status(): JSObject {
        val rec = store.active()
        return JSObject().apply {
            put("state", rec?.state?.wire ?: "idle")
            put("recordingId", rec?.id ?: JSONObject.NULL)
            put("startedAt", rec?.startedAt ?: JSONObject.NULL)
            put("pointCount", rec?.nextSeq ?: 0)
            put("backgroundCapable", true)
        }
    }
}
