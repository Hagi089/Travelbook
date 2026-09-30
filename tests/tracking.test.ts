import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GpxDb, getTour, getTrackPoints, listTours, seedDefaultCategories } from '../src/db';
import {
  createWebTracking,
  finishRecording,
  ingestPending,
  recoverRecordings,
  startRecording,
  type NativePoint,
  type TrackingPlugin,
  type TrackingStatus,
} from '../src/tracking';

let counter = 0;
let db: GpxDb;

beforeEach(async () => {
  db = new GpxDb(`tracking-test-db-${++counter}`);
  await db.open();
  await seedDefaultCategories(db);
});

/** Simuliert den nativen Puffer: append-only, Punkte bleiben bis zur Bestätigung erhalten. */
class FakeNative implements TrackingPlugin {
  state: TrackingStatus['state'] = 'idle';
  recordingId: string | null = null;
  startedAt: number | null = null;
  buffer: NativePoint[] = [];
  nextSeq = 0;
  segment = 0;
  failStart = false;
  failAckTimes = 0;

  status(): TrackingStatus {
    return { state: this.state, recordingId: this.recordingId, startedAt: this.startedAt, pointCount: this.nextSeq, backgroundCapable: true };
  }
  /** Von außen: das Gerät liefert einen Punkt (auch ohne dass die WebView läuft). */
  fix(lat: number, lon: number, time: number): void {
    if (this.state !== 'recording') return;
    this.buffer.push({ seq: this.nextSeq++, segment: this.segment, time, lat, lon, ele: 100, accuracy: 5 });
  }
  async start(o: { recordingId: string }) {
    if (this.failStart) throw new Error('Berechtigung fehlt');
    this.state = 'recording';
    this.recordingId = o.recordingId;
    this.startedAt = 1000;
    return this.status();
  }
  async pause() {
    this.state = 'paused';
    return this.status();
  }
  async resume() {
    this.segment++;
    this.state = 'recording';
    return this.status();
  }
  async stop() {
    this.state = 'idle';
    return this.status();
  }
  async getStatus() {
    return this.status();
  }
  async getPendingPoints(o: { recordingId: string; limit: number }) {
    return { points: o.recordingId === this.recordingId ? this.buffer.slice(0, o.limit) : [] };
  }
  async ackPoints(o: { recordingId: string; upToSeq: number }) {
    if (this.failAckTimes > 0) {
      this.failAckTimes--;
      throw new Error('Bestätigung fehlgeschlagen');
    }
    this.buffer = this.buffer.filter((p) => p.seq > o.upToSeq);
  }
  async checkPermissions() {
    return { location: 'granted' as const, notifications: 'granted' as const };
  }
  async requestPermissions() {
    return this.checkPermissions();
  }
  async openSettings() {}
}

const T0 = Date.UTC(2026, 8, 29, 8, 0, 0);

describe('Aufnahme starten', () => {
  it('legt die Tour vor dem ersten Punkt an (Quelle recording, ohne Endzeit)', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: '  Runde  ', categoryId: 'default-wandern', profile: 'normal' });
    expect(tour.name).toBe('Runde');
    expect(tour.source).toBe('recording');
    expect(tour.endTime).toBeNull();
    expect(native.recordingId).toBe(tour.id);
    expect((await getTour(db, tour.id))?.id).toBe(tour.id);
  });

  it('vergibt bei leerem Namen einen automatischen Namen', async () => {
    const tour = await startRecording(db, new FakeNative(), { name: ' ', categoryId: 'default-wandern', profile: 'high' });
    expect(tour.name).toMatch(/^Aufnahme \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
  });

  it('entfernt die Tour wieder, wenn das Plugin nicht startet', async () => {
    const native = new FakeNative();
    native.failStart = true;
    await expect(startRecording(db, native, { name: 'X', categoryId: 'default-wandern', profile: 'normal' })).rejects.toThrow('Berechtigung');
    expect(await listTours(db)).toHaveLength(0);
  });

  it('blendet laufende Aufnahmen in listTours aus, bis sie beendet sind', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'Läuft', categoryId: 'default-wandern', profile: 'normal' });
    expect(await listTours(db)).toHaveLength(0);
    expect(await listTours(db, { categoryId: 'default-wandern' })).toHaveLength(0);
    expect((await listTours(db, { includeOpenRecordings: true })).map((t) => t.id)).toEqual([tour.id]);
    native.fix(48.1, 11.5, 1_000);
    native.fix(48.1005, 11.5005, 6_000);
    await finishRecording(db, native, tour.id);
    expect((await listTours(db)).map((t) => t.id)).toEqual([tour.id]);
  });

  it('lehnt eine unbekannte Kategorie ab, ohne das Plugin zu starten', async () => {
    const native = new FakeNative();
    await expect(startRecording(db, native, { name: 'X', categoryId: 'gibt-es-nicht', profile: 'normal' })).rejects.toThrow('Kategorie');
    expect(native.state).toBe('idle');
  });
});

describe('Punkte übernehmen', () => {
  it('schreibt Punkte mit der nativen seq und bestätigt sie danach', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    native.fix(48, 11, T0);
    native.fix(48.001, 11, T0 + 10_000);
    expect(await ingestPending(db, native, tour.id)).toBe(2);
    const pts = await getTrackPoints(db, tour.id);
    expect(pts.map((p) => p.seq)).toEqual([0, 1]);
    expect(native.buffer).toHaveLength(0);
  });

  it('ist idempotent: fehlgeschlagene Bestätigung führt beim nächsten Versuch nicht zu Duplikaten', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    for (let i = 0; i < 3; i++) native.fix(48 + i * 0.001, 11, T0 + i * 10_000);
    native.failAckTimes = 1;
    await expect(ingestPending(db, native, tour.id)).rejects.toThrow('Bestätigung');
    expect(native.buffer).toHaveLength(3); // nichts verloren
    expect(await ingestPending(db, native, tour.id)).toBe(3);
    expect(await getTrackPoints(db, tour.id)).toHaveLength(3);
    expect(native.buffer).toHaveLength(0);
  });

  it('übernimmt mehr Punkte als eine Runde fasst', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    for (let i = 0; i < 1234; i++) native.fix(48 + i * 0.00001, 11, T0 + i * 1000);
    expect(await ingestPending(db, native, tour.id)).toBe(1234);
    expect(await getTrackPoints(db, tour.id)).toHaveLength(1234);
  });

  it('bricht nicht endlos, wenn ein Plugin bestätigte Punkte erneut liefert', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    native.fix(48, 11, T0);
    native.ackPoints = async () => {}; // defektes Plugin: löscht nie
    expect(await ingestPending(db, native, tour.id)).toBe(1);
    expect(await getTrackPoints(db, tour.id)).toHaveLength(1);
  });

  it('überspringt ungültige Koordinaten', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    native.fix(48, 11, T0);
    native.fix(Number.NaN, 11, T0 + 1000);
    native.fix(95, 11, T0 + 2000);
    native.fix(48.001, 11, T0 + 3000);
    await ingestPending(db, native, tour.id);
    expect((await getTrackPoints(db, tour.id)).map((p) => p.seq)).toEqual([0, 3]);
  });

  it('gleichzeitige Aufrufe erzeugen keine doppelten oder fehlenden Punkte', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    for (let i = 0; i < 50; i++) native.fix(48 + i * 0.0001, 11, T0 + i * 1000);
    await Promise.all([ingestPending(db, native, tour.id), ingestPending(db, native, tour.id), ingestPending(db, native, tour.id)]);
    expect(await getTrackPoints(db, tour.id)).toHaveLength(50);
  });
});

describe('Aufnahme beenden', () => {
  it('berechnet Tourwerte aus den Punkten und behält Segmente bei Pause/Fortsetzen', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    native.fix(48.0, 11, T0);
    native.fix(48.001, 11, T0 + 60_000);
    await native.pause();
    await native.resume();
    native.fix(48.01, 11, T0 + 600_000); // weit weg: wird wegen neuem Segment nicht verbunden
    native.fix(48.011, 11, T0 + 660_000);
    const done = await finishRecording(db, native, tour.id);
    expect(done).not.toBeNull();
    const pts = await getTrackPoints(db, tour.id);
    expect(pts.map((p) => p.segment)).toEqual([0, 0, 1, 1]);
    // 2 × ca. 111 m; die Lücke zwischen den Segmenten zählt nicht.
    expect(done!.distanceM).toBeGreaterThan(200);
    expect(done!.distanceM).toBeLessThan(240);
    expect(done!.startTime).toBe(T0);
    expect(done!.endTime).toBe(T0 + 660_000);
    expect(done!.durationSec).toBe(660);
    expect(done!.startPoint).toEqual({ lat: 48, lon: 11 });
    expect(native.state).toBe('idle');
  });

  it('verwirft eine Aufnahme ohne Punkte', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    expect(await finishRecording(db, native, tour.id)).toBeNull();
    expect(await listTours(db)).toHaveLength(0);
  });

  it('übernimmt beim Beenden auch noch nicht abgeholte Punkte', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    native.fix(48, 11, T0);
    native.fix(48.001, 11, T0 + 60_000);
    const done = await finishRecording(db, native, tour.id);
    expect(done!.distanceM).toBeGreaterThan(100);
  });
});

describe('Wiederherstellung nach App-Ende', () => {
  it('läuft der Dienst noch, werden aufgelaufene Punkte übernommen und die Aufnahme bleibt aktiv', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    native.fix(48, 11, T0);
    native.fix(48.001, 11, T0 + 1000);
    const r = await recoverRecordings(db, native);
    expect(r.activeTourId).toBe(tour.id);
    expect(r.finalized).toHaveLength(0);
    expect(await getTrackPoints(db, tour.id)).toHaveLength(2);
    expect((await getTour(db, tour.id))?.endTime).toBeNull();
  });

  it('legt die Tour nach, wenn die Datenbank die laufende Aufnahme nicht kennt', async () => {
    const native = new FakeNative();
    await native.start({ recordingId: 'unbekannt' });
    native.fix(48, 11, T0);
    const r = await recoverRecordings(db, native);
    expect(r.activeTourId).toBe('unbekannt');
    expect(await getTrackPoints(db, 'unbekannt')).toHaveLength(1);
    expect((await getTour(db, 'unbekannt'))?.source).toBe('recording');
  });

  it('schließt eine unterbrochene Aufnahme ab und holt verbliebene native Punkte (Stopp, dann App beendet)', async () => {
    const native = new FakeNative();
    const tour = await startRecording(db, native, { name: 'A', categoryId: 'default-wandern', profile: 'normal' });
    native.fix(48, 11, T0);
    native.fix(48.001, 11, T0 + 60_000);
    await native.stop(); // Punkte noch im Puffer, nichts übernommen, Tour offen
    const r = await recoverRecordings(db, native);
    expect(r.activeTourId).toBeNull();
    expect(r.finalized).toHaveLength(1);
    const saved = await getTour(db, tour.id);
    expect(saved?.endTime).toBe(T0 + 60_000);
    expect(saved!.distanceM).toBeGreaterThan(100);
    expect(await getTrackPoints(db, tour.id)).toHaveLength(2);
  });

  it('verwirft unterbrochene Aufnahmen ohne Punkte und lässt fertige Touren unberührt', async () => {
    const native = new FakeNative();
    const leer = await startRecording(db, native, { name: 'Leer', categoryId: 'default-wandern', profile: 'normal' });
    await native.stop();
    const r = await recoverRecordings(db, native);
    expect(r.discarded).toBe(1);
    expect(await getTour(db, leer.id)).toBeUndefined();

    const fertig = await startRecording(db, native, { name: 'Fertig', categoryId: 'default-wandern', profile: 'normal' });
    native.fix(48, 11, T0);
    await finishRecording(db, native, fertig.id);
    const again = await recoverRecordings(db, native);
    expect(again.finalized).toHaveLength(0);
    expect(again.discarded).toBe(0);
  });
});

describe('Web-Fallback', () => {
  function fakeGeo() {
    let cb: PositionCallback | null = null;
    let errCb: PositionErrorCallback | null = null;
    let cleared = 0;
    const geo = {
      watchPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => {
        cb = success;
        errCb = error ?? null;
        return 7;
      },
      clearWatch: () => {
        cleared++;
        cb = null;
      },
    } as unknown as Geolocation;
    const emit = (lat: number, lon: number, t: number) =>
      cb?.({ timestamp: t, coords: { latitude: lat, longitude: lon, altitude: null, accuracy: 10 } } as unknown as GeolocationPosition);
    const fail = (code: number) => errCb?.({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' } as GeolocationPositionError);
    return { geo, emit, fail, cleared: () => cleared };
  }

  it('meldet sich als nicht hintergrundfähig und liefert Punkte mit fortlaufender seq', async () => {
    const g = fakeGeo();
    const web = createWebTracking(g.geo);
    const st = await web.start({ recordingId: 'r1', profile: 'normal' });
    expect(st.backgroundCapable).toBe(false);
    g.emit(48, 11, T0);
    g.emit(48.001, 11, T0 + 1000);
    const { points } = await web.getPendingPoints({ recordingId: 'r1', limit: 10 });
    expect(points.map((p) => p.seq)).toEqual([0, 1]);
    await web.ackPoints({ recordingId: 'r1', upToSeq: 0 });
    expect((await web.getPendingPoints({ recordingId: 'r1', limit: 10 })).points.map((p) => p.seq)).toEqual([1]);
  });

  it('erhöht das Segment nach Pause/Fortsetzen und stoppt die Ortung', async () => {
    const g = fakeGeo();
    const web = createWebTracking(g.geo);
    await web.start({ recordingId: 'r1', profile: 'saver' });
    g.emit(48, 11, T0);
    await web.pause();
    expect(g.cleared()).toBe(1);
    await web.resume();
    g.emit(48.5, 11, T0 + 5000);
    const { points } = await web.getPendingPoints({ recordingId: 'r1', limit: 10 });
    expect(points.map((p) => p.segment)).toEqual([0, 1]);
    await web.stop();
    expect((await web.getStatus()).state).toBe('idle');
  });

  it('lehnt einen zweiten Start und fremde Recording-IDs ab', async () => {
    const g = fakeGeo();
    const web = createWebTracking(g.geo);
    await web.start({ recordingId: 'r1', profile: 'normal' });
    await expect(web.start({ recordingId: 'r2', profile: 'normal' })).rejects.toThrow('bereits');
    expect((await web.getPendingPoints({ recordingId: 'anders', limit: 5 })).points).toEqual([]);
  });

  it('meldet eine verweigerte Standortfreigabe im Status, ignoriert aber einzelne Zeitüberschreitungen', async () => {
    const g = fakeGeo();
    const web = createWebTracking(g.geo);
    await web.start({ recordingId: 'r1', profile: 'normal' });
    g.fail(3); // Zeitüberschreitung: kein Fix, keine Meldung
    expect((await web.getStatus()).error).toBeNull();
    g.fail(1); // PERMISSION_DENIED
    expect((await web.getStatus()).error).toContain('Standortfreigabe');
    g.emit(48, 11, T0); // sobald wieder Punkte kommen, verschwindet die Meldung
    expect((await web.getStatus()).error).toBeNull();
    await web.stop();
    await web.start({ recordingId: 'r2', profile: 'normal' });
    expect((await web.getStatus()).error).toBeNull();
  });

  it('meldet einen Fehler, wenn der Browser keine Standortbestimmung hat', async () => {
    const web = createWebTracking(undefined);
    await expect(web.start({ recordingId: 'r1', profile: 'normal' })).rejects.toThrow('Standortbestimmung');
    expect((await web.getStatus()).state).toBe('idle');
  });
});
