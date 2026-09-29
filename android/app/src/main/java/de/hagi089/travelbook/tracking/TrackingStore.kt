package de.hagi089.travelbook.tracking

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** Zustand einer Aufnahme im nativen Puffer. */
enum class RecState(val wire: String) {
    RECORDING("recording"),
    PAUSED("paused"),
    STOPPED("stopped");

    companion object {
        fun from(s: String): RecState = entries.firstOrNull { it.wire == s } ?: STOPPED
    }
}

data class Recording(
    val id: String,
    val state: RecState,
    val profile: String,
    val startedAt: Long,
    val segment: Int,
    /** Nächste zu vergebende seq. Wird nie zurückgesetzt, auch nicht nach dem Bestätigen (Löschen) von Punkten. */
    val nextSeq: Int,
) {
    val isActive: Boolean get() = state != RecState.STOPPED
}

data class StoredPoint(
    val seq: Int,
    val segment: Int,
    val time: Long,
    val lat: Double,
    val lon: Double,
    val ele: Double?,
    val accuracy: Double?,
)

/**
 * Nativer, append-only Puffer der Aufnahme (ADR-001): Punkte werden hier gespeichert, BEVOR die WebView sie sieht.
 * Vergabe von seq und Einfügen des Punkts passieren in einer Transaktion, damit nach einem Absturz keine seq doppelt vergeben wird.
 * Punkte werden nur nach Bestätigung durch die Web-Oberfläche gelöscht ([ack]).
 */
class TrackingStore private constructor(context: Context) : SQLiteOpenHelper(context.applicationContext, "tracking.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE recordings (id TEXT PRIMARY KEY, state TEXT NOT NULL, profile TEXT NOT NULL, " +
                "started_at INTEGER NOT NULL, segment INTEGER NOT NULL, next_seq INTEGER NOT NULL)",
        )
        db.execSQL(
            "CREATE TABLE points (recording_id TEXT NOT NULL, seq INTEGER NOT NULL, segment INTEGER NOT NULL, " +
                "time INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, ele REAL, accuracy REAL, " +
                "PRIMARY KEY (recording_id, seq))",
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Schema-Version 1. Spätere Änderungen nur mit Migration, Punkte dürfen nie verloren gehen.
    }

    /** Legt eine neue aktive Aufnahme an. Wirft, wenn bereits eine aktiv ist oder die ID schon existiert. */
    @Synchronized
    fun begin(id: String, profile: String, now: Long): Recording {
        val db = writableDatabase
        db.beginTransaction()
        try {
            if (activeIn(db) != null) throw IllegalStateException("Es läuft bereits eine Aufnahme.")
            val values = ContentValues().apply {
                put("id", id)
                put("state", RecState.RECORDING.wire)
                put("profile", profile)
                put("started_at", now)
                put("segment", 0)
                put("next_seq", 0)
            }
            if (db.insert("recordings", null, values) == -1L) throw IllegalStateException("Recording-ID existiert bereits.")
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return Recording(id, RecState.RECORDING, profile, now, 0, 0)
    }

    @Synchronized
    fun active(): Recording? = activeIn(readableDatabase)

    private fun activeIn(db: SQLiteDatabase): Recording? =
        db.rawQuery(
            "SELECT id, state, profile, started_at, segment, next_seq FROM recordings WHERE state != ? LIMIT 1",
            arrayOf(RecState.STOPPED.wire),
        ).use { c ->
            if (c.moveToFirst()) Recording(c.getString(0), RecState.from(c.getString(1)), c.getString(2), c.getLong(3), c.getInt(4), c.getInt(5)) else null
        }

    /** Pausieren, Fortsetzen (neues Segment) oder Stoppen. Gibt die aktualisierte Aufnahme zurück oder null, wenn keine aktiv ist. */
    @Synchronized
    fun pause(): Recording? = change { it.copy(state = RecState.PAUSED) }

    @Synchronized
    fun resume(): Recording? = change { it.copy(state = RecState.RECORDING, segment = it.segment + 1) }

    @Synchronized
    fun stop(): Recording? = change { it.copy(state = RecState.STOPPED) }

    private fun change(f: (Recording) -> Recording): Recording? {
        val db = writableDatabase
        val cur = activeIn(db) ?: return null
        val next = f(cur)
        val values = ContentValues().apply {
            put("state", next.state.wire)
            put("segment", next.segment)
        }
        db.update("recordings", values, "id = ?", arrayOf(cur.id))
        return next
    }

    /**
     * Hängt einen Punkt an die aktive Aufnahme an. Gibt false zurück, wenn keine Aufnahme im Zustand "recording" läuft
     * (z. B. Punkt trifft nach dem Pausieren ein) – der Punkt wird dann verworfen.
     */
    @Synchronized
    fun append(time: Long, lat: Double, lon: Double, ele: Double?, accuracy: Double?): Boolean {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val rec = activeIn(db)
            if (rec == null || rec.state != RecState.RECORDING) return false
            val values = ContentValues().apply {
                put("recording_id", rec.id)
                put("seq", rec.nextSeq)
                put("segment", rec.segment)
                put("time", time)
                put("lat", lat)
                put("lon", lon)
                if (ele != null) put("ele", ele) else putNull("ele")
                if (accuracy != null) put("accuracy", accuracy) else putNull("accuracy")
            }
            db.insertOrThrow("points", null, values)
            db.execSQL("UPDATE recordings SET next_seq = next_seq + 1 WHERE id = ?", arrayOf(rec.id))
            db.setTransactionSuccessful()
            return true
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun pending(recordingId: String, limit: Int): List<StoredPoint> =
        readableDatabase.rawQuery(
            "SELECT seq, segment, time, lat, lon, ele, accuracy FROM points WHERE recording_id = ? ORDER BY seq LIMIT ?",
            arrayOf(recordingId, limit.toString()),
        ).use { c ->
            val out = ArrayList<StoredPoint>(c.count)
            while (c.moveToNext()) {
                out.add(
                    StoredPoint(
                        c.getInt(0), c.getInt(1), c.getLong(2), c.getDouble(3), c.getDouble(4),
                        if (c.isNull(5)) null else c.getDouble(5),
                        if (c.isNull(6)) null else c.getDouble(6),
                    ),
                )
            }
            out
        }

    /** Löscht bestätigte Punkte. Erst aufrufen, nachdem die Web-Oberfläche sie dauerhaft gespeichert hat. */
    @Synchronized
    fun ack(recordingId: String, upToSeq: Int) {
        writableDatabase.delete("points", "recording_id = ? AND seq <= ?", arrayOf(recordingId, upToSeq.toString()))
    }

    companion object {
        @Volatile
        private var instance: TrackingStore? = null

        fun get(context: Context): TrackingStore =
            instance ?: synchronized(this) { instance ?: TrackingStore(context).also { instance = it } }
    }
}
