import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { GpxDb, getTrackPoints, listTours, seedDefaultCategories } from '../src/db';
import {
  ELEVATION_THRESHOLD_M,
  GpxError,
  computeStats,
  exportGpx,
  haversineM,
  parseGpx,
  prepareImport,
  saveDraft,
  type NewTrackPoint,
} from '../src/gpx';

const GPX_NS = 'xmlns="http://www.topografix.com/GPX/1/1"';
const T0 = Date.UTC(2026, 8, 1, 10, 0, 0);

function pt(over: Partial<NewTrackPoint> = {}): NewTrackPoint {
  return { segment: 0, lat: 0, lon: 0, ele: null, time: null, accuracy: null, ...over };
}

describe('parseGpx', () => {
  it('liest Name, Punkte, Höhe und Zeit', () => {
    const r = parseGpx(`<?xml version="1.0"?><gpx ${GPX_NS}><trk><name>Runde</name><trkseg>
      <trkpt lat="48.1" lon="11.5"><ele>520.5</ele><time>2026-09-01T10:00:00Z</time></trkpt>
      <trkpt lat="48.2" lon="11.6"><ele>530</ele><time>2026-09-01T10:01:00Z</time></trkpt>
    </trkseg></trk></gpx>`);
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0]!.name).toBe('Runde');
    expect(r.tracks[0]!.points).toEqual([
      { segment: 0, lat: 48.1, lon: 11.5, ele: 520.5, time: T0, accuracy: null },
      { segment: 0, lat: 48.2, lon: 11.6, ele: 530, time: T0 + 60000, accuracy: null },
    ]);
  });

  it('unterscheidet mehrere Segmente und mehrere Tracks', () => {
    const r = parseGpx(`<gpx ${GPX_NS}>
      <trk><name>A</name>
        <trkseg><trkpt lat="1" lon="1"/><trkpt lat="1" lon="2"/></trkseg>
        <trkseg><trkpt lat="2" lon="1"/></trkseg>
      </trk>
      <trk><trkseg><trkpt lat="5" lon="5"/></trkseg></trk>
    </gpx>`);
    expect(r.tracks).toHaveLength(2);
    expect(r.tracks[0]!.points.map((p) => p.segment)).toEqual([0, 0, 1]);
    expect(r.tracks[1]!.name).toBeNull();
  });

  it('kommt mit fehlenden Höhen, Zeiten, Namen und Erweiterungen zurecht', () => {
    const r = parseGpx(`<gpx xmlns="http://www.topografix.com/GPX/1/0" xmlns:gpxtpx="x"><trk><trkseg>
      <trkpt lat="10" lon="20"><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="10.001" lon="20"><time>kaputt</time></trkpt>
    </trkseg></trk></gpx>`);
    expect(r.tracks[0]!.points.every((p) => p.ele === null && p.time === null)).toBe(true);
    expect(r.tracks[0]!.name).toBeNull();
  });

  it('liest Waypoints', () => {
    const r = parseGpx(`<gpx ${GPX_NS}><wpt lat="47" lon="8"><ele>400</ele><name>Hütte</name></wpt>
      <trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>`);
    expect(r.waypoints).toEqual([{ lat: 47, lon: 8, name: 'Hütte', ele: 400, time: null }]);
  });

  it('übernimmt Routen, wenn es keine Tracks gibt', () => {
    const r = parseGpx(`<gpx ${GPX_NS}><rte><name>R</name><rtept lat="1" lon="1"/><rtept lat="1" lon="2"/></rte></gpx>`);
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0]!.points).toHaveLength(2);
    expect(r.warnings.join(' ')).toMatch(/Route/);
  });

  it('überspringt ungültige Koordinaten mit Warnung', () => {
    const r = parseGpx(`<gpx ${GPX_NS}><trk><trkseg>
      <trkpt lat="91" lon="0"/><trkpt lat="abc" lon="0"/><trkpt lat="1" lon="1"/></trkseg></trk></gpx>`);
    expect(r.tracks[0]!.points).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/2 Punkt/);
  });

  it('meldet Fehler für kaputtes XML, fremdes XML und leere GPX', () => {
    expect(() => parseGpx('<gpx><trk>')).toThrow(GpxError);
    expect(() => parseGpx('<html><body/></html>')).toThrow(/gpx/);
    expect(() => parseGpx(`<gpx ${GPX_NS}></gpx>`)).toThrow(GpxError);
    expect(() => parseGpx(`<gpx ${GPX_NS}><metadata/></gpx>`)).toThrow(/weder Tracks/);
  });

  it('erträgt BOM und Sonderzeichen im Namen', () => {
    const r = parseGpx(`﻿<gpx ${GPX_NS}><trk><name>A &amp; B &lt;x&gt; Ü</name><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>`);
    expect(r.tracks[0]!.name).toBe('A & B <x> Ü');
  });
});

describe('computeStats', () => {
  it('rechnet Haversine-Distanz (1° Breite ≈ 111,2 km)', () => {
    expect(haversineM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111195, -2);
    expect(haversineM({ lat: 10, lon: 10 }, { lat: 10, lon: 10 })).toBe(0);
  });

  it('zählt Höhenmeter mit Rauschschwelle', () => {
    const eles = [100, 101, 100, 102, 110, 120, 115, 100];
    const stats = computeStats(eles.map((ele, i) => pt({ lon: i * 0.0001, ele })));
    expect(ELEVATION_THRESHOLD_M).toBe(3);
    expect(stats.ascentM).toBe(20);
    expect(stats.descentM).toBe(20);
  });

  it('ignoriert Punkte ohne Höhe bei den Höhenmetern', () => {
    const stats = computeStats([pt({ ele: 100 }), pt({ lon: 0.001 }), pt({ lon: 0.002, ele: 110 })]);
    expect(stats.ascentM).toBe(10);
  });

  it('berechnet Dauer, Durchschnitts- und Höchstgeschwindigkeit', () => {
    // 0,001° Länge am Äquator ≈ 111,19 m in 10 s ≈ 11,12 m/s
    const stats = computeStats([0, 1, 2, 3].map((i) => pt({ lon: i * 0.001, time: T0 + i * 10000 })));
    expect(stats.durationSec).toBe(30);
    expect(stats.distanceM).toBeCloseTo(333.6, 0);
    expect(stats.avgSpeedMs).toBeCloseTo(11.12, 1);
    expect(stats.maxSpeedMs).toBeCloseTo(11.12, 1);
    expect(stats.startTime).toBe(T0);
    expect(stats.endTime).toBe(T0 + 30000);
  });

  it('lässt GPS-Sprünge aus den Berechnungen heraus', () => {
    const stats = computeStats([
      pt({ lon: 0, time: T0 }),
      pt({ lon: 0.001, time: T0 + 10000 }),
      pt({ lon: 1.001, time: T0 + 11000 }), // ~111 km in 1 s
      pt({ lon: 1.002, time: T0 + 21000 }),
    ]);
    expect(stats.skippedJumps).toBe(1);
    expect(stats.maxSpeedMs).toBeLessThan(15);
    expect(stats.distanceM).toBeLessThan(400);
  });

  it('verbindet Segmente nicht durch eine Luftlinie', () => {
    const pts = [pt({ segment: 0 }), pt({ segment: 0, lon: 0.001 }), pt({ segment: 1, lat: 10 }), pt({ segment: 1, lat: 10, lon: 0.001 })];
    const expected = haversineM(pts[0]!, pts[1]!) + haversineM(pts[2]!, pts[3]!);
    expect(computeStats(pts).distanceM).toBeCloseTo(expected, 6);
  });

  it('liefert für Tracks ohne Zeit Dauer 0 und Distanz trotzdem', () => {
    const stats = computeStats([pt(), pt({ lon: 0.01 })]);
    expect(stats.durationSec).toBe(0);
    expect(stats.avgSpeedMs).toBe(0);
    expect(stats.startTime).toBeNull();
    expect(stats.distanceM).toBeGreaterThan(1000);
  });

  it('behandelt leere Tracks', () => {
    const stats = computeStats([]);
    expect(stats.distanceM).toBe(0);
    expect(stats.startPoint).toBeNull();
  });
});

describe('exportGpx', () => {
  it('erzeugt GPX 1.1, maskiert Sonderzeichen und lässt fehlende Werte weg', () => {
    const xml = exportGpx({ name: 'A & B <x>', notes: 'Notiz "1"', points: [pt({ lat: 1, lon: 2 })] });
    expect(xml).toContain('version="1.1"');
    expect(xml).toContain('<name>A &amp; B &lt;x&gt;</name>');
    expect(xml).toContain('<desc>Notiz &quot;1&quot;</desc>');
    expect(xml).not.toContain('<ele>');
    expect(xml).not.toContain('<time>');
    expect(xml.indexOf('<wpt')).toBe(-1);
  });

  it('schreibt Waypoints vor dem Track', () => {
    const xml = exportGpx({
      name: 'T',
      points: [pt()],
      waypoints: [{ lat: 1, lon: 1, name: 'W', ele: 5, time: T0 }],
    });
    expect(xml.indexOf('<wpt')).toBeLessThan(xml.indexOf('<trk>'));
  });
});

describe('Roundtrip', () => {
  const sample: NewTrackPoint[] = Array.from({ length: 200 }, (_, i) => ({
    segment: i < 120 ? 0 : 1,
    lat: 48.1234567 + i * 0.0002,
    lon: 11.7654321 + i * 0.0003,
    ele: i % 7 === 0 ? null : 500 + Math.round(Math.sin(i / 10) * 200) / 2,
    time: i % 11 === 0 ? null : T0 + i * 5000,
    accuracy: null,
  }));

  it('Parser → Export → Parser verliert keine wesentlichen Trackinformationen', () => {
    const xml1 = exportGpx({
      name: 'Rundtour',
      points: sample,
      waypoints: [{ lat: 48.5, lon: 11.5, name: 'Gipfel', ele: 900, time: null }],
    });
    const a = parseGpx(xml1);
    const xml2 = exportGpx({ name: a.tracks[0]!.name ?? '', points: a.tracks[0]!.points, waypoints: a.waypoints });
    const b = parseGpx(xml2);

    expect(b.tracks).toHaveLength(1);
    expect(b.tracks[0]!.name).toBe('Rundtour');
    expect(b.tracks[0]!.points).toHaveLength(sample.length);
    b.tracks[0]!.points.forEach((p, i) => {
      const o = sample[i]!;
      expect(p.segment).toBe(o.segment);
      expect(p.lat).toBeCloseTo(o.lat, 6);
      expect(p.lon).toBeCloseTo(o.lon, 6);
      expect(p.ele).toBe(o.ele);
      expect(p.time).toBe(o.time);
    });
    expect(b.waypoints).toEqual(a.waypoints);
    const s1 = computeStats(a.tracks[0]!.points);
    const s2 = computeStats(b.tracks[0]!.points);
    expect(s2.distanceM).toBeCloseTo(s1.distanceM, 1);
    expect(s2.ascentM).toBeCloseTo(s1.ascentM, 5);
    expect(s2.descentM).toBeCloseTo(s1.descentM, 5);
    expect(s2.durationSec).toBe(s1.durationSec);
  });

  it('Import → Datenbank → Export → erneuter Import', async () => {
    const db = new GpxDb('gpx-roundtrip');
    await db.open();
    await seedDefaultCategories(db);
    const xml = exportGpx({ name: 'Original', points: sample });
    const { drafts } = prepareImport(xml, 'datei.gpx');
    expect(drafts).toHaveLength(1);
    const tour = await saveDraft(db, drafts[0]!, { categoryId: 'default-wandern', notes: 'ok' });
    expect(tour.source).toBe('gpx-import');
    expect(tour.distanceM).toBeCloseTo(drafts[0]!.stats.distanceM, 6);
    expect((await listTours(db))).toHaveLength(1);

    const stored = await getTrackPoints(db, tour.id);
    const xml2 = exportGpx({ name: tour.name, notes: tour.notes, points: stored });
    const again = prepareImport(xml2).drafts[0]!;
    expect(again.points).toHaveLength(sample.length);
    expect(again.stats.distanceM).toBeCloseTo(tour.distanceM, 1);
    expect(again.name).toBe('Original');
  });
});

describe('prepareImport', () => {
  it('wählt Namen in der Reihenfolge Track, Metadaten, Dateiname, Standard', () => {
    const t = (name: string) => `<trk>${name}<trkseg><trkpt lat="1" lon="1"/></trkseg></trk>`;
    const mk = (meta: string, trk: string) => `<gpx ${GPX_NS}>${meta}${t(trk)}</gpx>`;
    expect(prepareImport(mk('<metadata><name>M</name></metadata>', '<name>T</name>')).drafts[0]!.name).toBe('T');
    expect(prepareImport(mk('<metadata><name>M</name></metadata>', '')).drafts[0]!.name).toBe('M');
    expect(prepareImport(mk('', ''), 'meine-tour.gpx').drafts[0]!.name).toBe('meine-tour');
    expect(prepareImport(mk('', '')).drafts[0]!.name).toBe('Importierte Tour');
  });

  it('macht aus jedem Track einen Entwurf, Waypoints gehören zum ersten', () => {
    const xml = `<gpx ${GPX_NS}><wpt lat="1" lon="1"/><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk><trk><trkseg><trkpt lat="2" lon="2"/></trkseg></trk></gpx>`;
    const { drafts } = prepareImport(xml);
    expect(drafts.map((d) => d.waypoints.length)).toEqual([1, 0]);
    expect(drafts[0]!.hasTime).toBe(false);
  });

  it('lehnt Dateien nur mit Waypoints ab', () => {
    expect(() => prepareImport(`<gpx ${GPX_NS}><wpt lat="1" lon="1"/></gpx>`)).toThrow(/keine Trackpunkte/);
  });
});

describe('große Dateien', () => {
  it('verarbeitet 50.000 Trackpunkte', () => {
    const points: NewTrackPoint[] = Array.from({ length: 50000 }, (_, i) => ({
      segment: 0,
      lat: 47 + i * 0.00001,
      lon: 8 + i * 0.00001,
      ele: 400 + (i % 50),
      time: T0 + i * 1000,
      accuracy: null,
    }));
    const xml = exportGpx({ name: 'Groß', points });
    const parsed = parseGpx(xml);
    expect(parsed.tracks[0]!.points).toHaveLength(50000);
    expect(computeStats(parsed.tracks[0]!.points).distanceM).toBeGreaterThan(50000);
  }, 60000);
});

