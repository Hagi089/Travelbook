/**
 * Schnittstelle zur GPS-Aufzeichnung (ADR-001, docs/ARCHITECTURE.md).
 *
 * Android: eigenes Kotlin-Plugin "Tracking" (Foreground Service, native Persistenz).
 * Browser: Web-Fallback mit watchPosition, ausdrücklich NICHT hintergrundfähig.
 *
 * Die Recording-ID ist gleich der Tour-ID. Die laufende Nummer `seq` wird vom Plugin vergeben
 * und ist zugleich der Schlüsselteil `seq` in der Tabelle trackPoints. Dadurch ist die Übernahme
 * idempotent: doppelt übergebene Punkte überschreiben sich selbst.
 */

export type TrackingProfile = 'high' | 'normal' | 'saver';

export type RecordingState = 'idle' | 'recording' | 'paused';

export type PermissionState = 'granted' | 'denied' | 'prompt';

/** Ein vom Plugin aufgezeichneter Punkt. Zeit in Unix-Millisekunden (UTC). */
export interface NativePoint {
  seq: number;
  /** Segmentnummer; wird nach jedem Pausieren/Fortsetzen um 1 erhöht. */
  segment: number;
  time: number;
  lat: number;
  lon: number;
  ele: number | null;
  accuracy: number | null;
}

export interface TrackingStatus {
  state: RecordingState;
  recordingId: string | null;
  /** Startzeit der Aufnahme (Unix-ms) oder null im Leerlauf. */
  startedAt: number | null;
  /** Anzahl der bisher aufgezeichneten Punkte dieser Aufnahme (nativ gezählt). */
  pointCount: number;
  /** false im Browser-Fallback: Aufnahme stoppt oder drosselt bei gesperrtem Display. */
  backgroundCapable: boolean;
}

export interface TrackingPermissions {
  location: PermissionState;
  /** Benachrichtigungen (Android 13+); ohne sie ist die Dauer-Notification des Dienstes evtl. unsichtbar. */
  notifications: PermissionState;
}

export interface TrackingPlugin {
  /** Startet die Aufnahme. Wirft, wenn bereits eine läuft oder die Standortberechtigung fehlt. */
  start(options: { recordingId: string; profile: TrackingProfile }): Promise<TrackingStatus>;
  pause(): Promise<TrackingStatus>;
  resume(): Promise<TrackingStatus>;
  /** Beendet die Aufnahme. Noch nicht bestätigte Punkte bleiben abholbar. */
  stop(): Promise<TrackingStatus>;
  getStatus(): Promise<TrackingStatus>;
  /** Liefert unbestätigte Punkte in aufsteigender seq, höchstens `limit`. */
  getPendingPoints(options: { recordingId: string; limit: number }): Promise<{ points: NativePoint[] }>;
  /** Bestätigt alle Punkte bis einschließlich `upToSeq`; erst danach darf das Plugin sie löschen. */
  ackPoints(options: { recordingId: string; upToSeq: number }): Promise<void>;
  checkPermissions(): Promise<TrackingPermissions>;
  requestPermissions(): Promise<TrackingPermissions>;
  /** Öffnet die Systemeinstellungen der App (Akku, Berechtigungen). */
  openSettings(): Promise<void>;
}

export const TRACKING_PROFILES: ReadonlyArray<{ id: TrackingProfile; label: string; hint: string }> = [
  { id: 'high', label: 'Hoch', hint: 'Genauester Track, höchster Akkuverbrauch.' },
  { id: 'normal', label: 'Normal', hint: 'Guter Kompromiss für die meisten Touren.' },
  { id: 'saver', label: 'Akku sparen', hint: 'Weniger Punkte, für lange Tage.' },
];
