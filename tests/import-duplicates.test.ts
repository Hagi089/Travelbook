import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { GpxDb, listTours, seedDefaultCategories } from '../src/db';
import type { Tour } from '../src/db/types';
import { findDuplicateTour, prepareImport, saveDraft } from '../src/gpx';

const NS = 'xmlns="http://www.topografix.com/GPX/1/1"';
const TIMED = `<gpx ${NS}><trk><name>Runde</name><trkseg>
  <trkpt lat="48.1" lon="11.5"><time>2026-09-01T10:00:00Z</time></trkpt>
  <trkpt lat="48.2" lon="11.6"><time>2026-09-01T10:10:00Z</time></trkpt>
</trkseg></trk></gpx>`;
const UNTIMED = `<gpx ${NS}><trk><name>Ohne Zeit</name><trkseg>
  <trkpt lat="10" lon="20"/><trkpt lat="10.1" lon="20.1"/>
</trkseg></trk></gpx>`;

function draft(xml: string) {
  return prepareImport(xml).drafts[0]!;
}

/** So, wie eine gespeicherte Tour aus dem Entwurf aussehen würde (siehe saveDraft). */
function stored(d: ReturnType<typeof draft>, over: Partial<Tour> = {}): Tour {
  const s = d.stats;
  return {
    id: 't1', name: 'Gespeichert', categoryId: 'default-wandern', date: d.date, startTime: s.startTime, endTime: s.endTime, durationSec: s.durationSec, distanceM: s.distanceM,
    ascentM: s.ascentM, descentM: s.descentM, avgSpeedMs: s.avgSpeedMs, maxSpeedMs: s.maxSpeedMs, startPoint: s.startPoint, endPoint: s.endPoint, notes: '', source: 'gpx-import',
    createdAt: 1, updatedAt: 1, ...over,
  };
}

describe('Duplikaterkennung beim GPX-Import', () => {
  it('erkennt dieselbe Datei erneut (gleiche Startzeit und Distanz)', () => {
    const d = draft(TIMED);
    expect(findDuplicateTour([stored(d)], draft(TIMED))?.id).toBe('t1');
  });

  it('toleriert kleine Distanzabweichungen (Rundung beim Export), nicht aber große', () => {
    const d = draft(TIMED);
    expect(findDuplicateTour([stored(d, { distanceM: d.stats.distanceM * 1.005 })], d)).toBeDefined();
    expect(findDuplicateTour([stored(d, { distanceM: d.stats.distanceM * 1.05 })], d)).toBeUndefined();
  });

  it('hält Touren mit anderer Startzeit für verschieden', () => {
    const d = draft(TIMED);
    expect(findDuplicateTour([stored(d, { startTime: (d.stats.startTime ?? 0) + 1000 })], d)).toBeUndefined();
  });

  it('erkennt Aufnahmen (Quelle recording) ebenfalls, ignoriert aber manuelle Touren', () => {
    const d = draft(TIMED);
    expect(findDuplicateTour([stored(d, { source: 'recording' })], d)).toBeDefined();
    expect(findDuplicateTour([stored(d, { source: 'manual' })], d)).toBeUndefined();
  });

  it('vergleicht ohne Zeitstempel den Startort; gemischt (mit/ohne Zeit) ist nie ein Duplikat', () => {
    const u = draft(UNTIMED);
    expect(findDuplicateTour([stored(u)], draft(UNTIMED))).toBeDefined();
    expect(findDuplicateTour([stored(u, { startPoint: { lat: 11, lon: 20 } })], u)).toBeUndefined();
    const t = draft(TIMED);
    expect(findDuplicateTour([stored(u, { distanceM: t.stats.distanceM })], t)).toBeUndefined();
  });

  it('meldet nichts bei leerer Liste', () => {
    expect(findDuplicateTour([], draft(TIMED))).toBeUndefined();
  });
});

describe('Duplikaterkennung über die Datenbank (wie im Import-Dialog)', () => {
  it('findet die gespeicherte Tour, wenn dieselbe Datei erneut gelesen wird', async () => {
    const db = new GpxDb('import-dup-db');
    await db.open();
    await seedDefaultCategories(db);
    const first = prepareImport(TIMED, 'runde.gpx').drafts[0]!;
    const saved = await saveDraft(db, first, { categoryId: 'default-wandern' });
    const again = prepareImport(TIMED, 'runde.gpx').drafts[0]!;
    expect(findDuplicateTour(await listTours(db), again)?.id).toBe(saved.id);
    const other = prepareImport(UNTIMED, 'andere.gpx').drafts[0]!;
    expect(findDuplicateTour(await listTours(db), other)).toBeUndefined();
  });
});
