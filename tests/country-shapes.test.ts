import { describe, expect, it } from 'vitest';
import { parseCountryData } from '../src/geo/countries';
import { COUNTRY_DATA } from '../src/geo/countryData';
import { buildCountryShapes, ringToLatLngs } from '../src/map/countryShapes';

describe('Offline-Weltkarte: Flächen aus den Ländergrenzen', () => {
  it('rechnet Ringe in Leaflet-Koordinaten [Breite, Länge] um', () => {
    expect(ringToLatLngs(new Float64Array([1000, 5000, 1100, 5000, 1100, 5100]))).toEqual([
      [50, 10],
      [50, 11],
      [51, 11],
    ]);
  });

  it('fasst Flächen je Land zusammen, behält Löcher und verwirft Ringe unter 3 Punkten', () => {
    // Format: { Code: [ Fläche: [ Ring: [x0, y0, dx1, dy1, ...] ] ] } in Hundertstelgrad, Punkte nach dem ersten als Differenz
    const index = parseCountryData(
      JSON.stringify({
        AA: [
          [[0, 0, 100, 0, 0, 100, -100, 0], [10, 10, 10, 0, 0, 10]], // Außenring + Loch
          [[500, 500, 50, 0, 0, 50]], // zweite Fläche
        ],
        BB: [[[0, 0, 1, 1]]], // nur 2 Punkte -> verworfen
      }),
    );
    const shapes = buildCountryShapes(index);
    expect(shapes.map((s) => s.code)).toEqual(['AA']);
    expect(shapes[0].polygons).toHaveLength(2);
    expect(shapes[0].polygons[0]).toHaveLength(2);
    expect(shapes[0].polygons[0][0]).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ]);
  });

  it('liefert aus den gebündelten Daten plausible Flächen für alle Länder', () => {
    const shapes = buildCountryShapes(parseCountryData(COUNTRY_DATA));
    expect(shapes.length).toBeGreaterThan(200);
    let vertices = 0;
    for (const s of shapes) {
      for (const poly of s.polygons) {
        for (const ring of poly) {
          vertices += ring.length;
          for (const [lat, lon] of ring) {
            expect(lat).toBeGreaterThanOrEqual(-90);
            expect(lat).toBeLessThanOrEqual(90);
            expect(lon).toBeGreaterThanOrEqual(-180);
            expect(lon).toBeLessThanOrEqual(180);
          }
        }
      }
    }
    expect(vertices).toBeLessThan(200000); // Zeichenaufwand der Canvas-Ebene bleibt klein
    const de = shapes.find((s) => s.code === 'DE');
    expect(de).toBeDefined();
    const lats = de!.polygons.flatMap((p) => p[0].map(([lat]) => lat));
    const lons = de!.polygons.flatMap((p) => p[0].map(([, lon]) => lon));
    expect(Math.min(...lats)).toBeGreaterThan(46.5);
    expect(Math.max(...lats)).toBeLessThan(56);
    expect(Math.min(...lons)).toBeGreaterThan(5);
    expect(Math.max(...lons)).toBeLessThan(16);
  });
});
