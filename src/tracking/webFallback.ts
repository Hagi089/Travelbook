import type { NativePoint, TrackingPermissions, TrackingPlugin, TrackingStatus, TrackingProfile } from './types';

/** Geolocation-Parameter je Profil. Werte sind Annahmen und an echten Geräten zu prüfen. */
const OPTIONS: Record<TrackingProfile, PositionOptions> = {
  high: { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  normal: { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
  saver: { enableHighAccuracy: false, maximumAge: 15000, timeout: 60000 },
};

/**
 * Aufnahme im Browser über watchPosition.
 * NICHT hintergrundfähig: Bei gesperrtem Display oder pausierter Seite wird sie vom Browser gedrosselt
 * oder gestoppt. Der Puffer liegt nur im Arbeitsspeicher; die Oberfläche übernimmt ihn regelmäßig in die Datenbank.
 * Dient zum Testen der Oberfläche und als Notlösung, nicht als Ersatz für das native Plugin.
 */
export function createWebTracking(geo: Geolocation | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined): TrackingPlugin {
  let state: TrackingStatus['state'] = 'idle';
  let recordingId: string | null = null;
  let startedAt: number | null = null;
  let watchId: number | null = null;
  let profile: TrackingProfile = 'normal';
  let segment = 0;
  let nextSeq = 0;
  let buffer: NativePoint[] = [];

  const status = (): TrackingStatus => ({ state, recordingId, startedAt, pointCount: nextSeq, backgroundCapable: false });

  function watch(): void {
    if (!geo) throw new Error('Dieser Browser unterstützt keine Standortbestimmung.');
    watchId = geo.watchPosition(
      (pos) => {
        buffer.push({
          seq: nextSeq++,
          segment,
          time: pos.timestamp,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          ele: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => undefined, // Einzelne Fehler (kein Fix) ignorieren; die Aufnahme läuft weiter.
      OPTIONS[profile],
    );
  }

  function unwatch(): void {
    if (watchId !== null && geo) geo.clearWatch(watchId);
    watchId = null;
  }

  async function permissions(): Promise<TrackingPermissions> {
    let location: TrackingPermissions['location'] = 'prompt';
    try {
      const r = await navigator.permissions?.query({ name: 'geolocation' });
      if (r) location = r.state;
    } catch {
      // Permissions-API nicht verfügbar: "prompt" bleibt.
    }
    return { location, notifications: 'granted' }; // Im Browser gibt es keine Dienst-Notification.
  }

  return {
    async start(o) {
      if (state !== 'idle') throw new Error('Es läuft bereits eine Aufnahme.');
      recordingId = o.recordingId;
      profile = o.profile;
      startedAt = Date.now();
      segment = 0;
      nextSeq = 0;
      buffer = [];
      try {
        watch();
      } catch (e) {
        recordingId = null;
        startedAt = null;
        throw e;
      }
      state = 'recording';
      return status();
    },
    async pause() {
      if (state !== 'recording') throw new Error('Keine laufende Aufnahme.');
      unwatch();
      state = 'paused';
      return status();
    },
    async resume() {
      if (state !== 'paused') throw new Error('Die Aufnahme ist nicht pausiert.');
      segment++;
      watch();
      state = 'recording';
      return status();
    },
    async stop() {
      unwatch();
      state = 'idle';
      return { ...status(), state: 'idle' };
    },
    async getStatus() {
      return status();
    },
    async getPendingPoints(o) {
      if (o.recordingId !== recordingId) return { points: [] };
      return { points: buffer.slice(0, o.limit) };
    },
    async ackPoints(o) {
      if (o.recordingId !== recordingId) return;
      buffer = buffer.filter((p) => p.seq > o.upToSeq);
    },
    checkPermissions: permissions,
    async requestPermissions() {
      // Der Browser fragt selbst beim ersten watchPosition-Aufruf.
      return permissions();
    },
    async openSettings() {
      // Im Browser nicht möglich.
    },
  };
}
