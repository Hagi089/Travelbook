#!/usr/bin/env python3
"""Erzeugt src/geo/countryData.ts aus Natural Earth (ne_50m_admin_0_countries.geojson, gemeinfrei).

Aufruf: python3 scripts/build-countries.py <pfad/zu/ne_50m_admin_0_countries.geojson> [toleranz_grad]

Vereinfachung: Douglas-Peucker mit Toleranz (Standard 0,03 Grad, ca. 3 km), Koordinaten auf 0,01 Grad gerundet
und als ganze Zahlen (Grad * 100) gespeichert. Format je Land (ISO-3166-1-Alpha-2): Liste von Polygonen, jedes Polygon
eine Liste von Ringen (außen, dann Löcher), jeder Ring flach als [x0, y0, dx1, dy1, ...] (erste Koordinate absolut, danach Differenzen).
"""
import json, sys

SRC = sys.argv[1]
TOL = float(sys.argv[2]) if len(sys.argv) > 2 else 0.03
OVERRIDE = {'Somaliland': 'SO', 'N. Cyprus': 'CY'}  # ISO_A2_EH fehlt (-99)
SKIP = {'Siachen Glacier'}                          # umstrittenes Gebiet ohne Zugehörigkeit
MIN_EXTENT = 0.15                                   # kleinere Nebenpolygone (Inselchen) entfallen, sofern das Land andere hat


def dp(pts, tol):
    """Douglas-Peucker (iterativ) auf einer offenen Punktliste."""
    n = len(pts)
    if n < 3:
        return pts
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        den = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if den == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / den
                t = max(0.0, min(1.0, t))
                d = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
            if d > best:
                best, idx = d, i
        if best > tol * tol and idx >= 0:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(pts, keep) if k]


def ring_out(ring, tol):
    pts = [(round(x * 100), round(y * 100)) for x, y in ring[:-1]]  # geschlossenen Ring öffnen, auf 0,01 Grad runden
    dedup = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
    s = dp(dedup, tol * 100)
    if len(s) < 3:
        return None
    flat = [s[0][0], s[0][1]]
    for i in range(1, len(s)):
        flat += [s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]]
    return flat


data = json.load(open(SRC, encoding='utf-8'))
out = {}
for f in data['features']:
    p = f['properties']
    if p['NAME'] in SKIP:
        continue
    code = OVERRIDE.get(p['NAME']) or p['ISO_A2_EH']
    if not code or code == '-99':
        raise SystemExit(f"Kein ISO-Code für {p['NAME']}")
    g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    cand = []
    for poly in polys:
        rings = [ring_out(r, TOL) for r in poly]
        if rings[0] is None:
            continue
        cand.append([r for r in rings if r is not None])
    if not cand:
        continue
    # Nebenpolygone unter MIN_EXTENT verwerfen, das größte Polygon eines Landes bleibt immer erhalten
    def poly_extent(pl):
        r = pl[0]
        x, y = r[0], r[1]
        xs, ys = [x], [y]
        for i in range(2, len(r), 2):
            x += r[i]; y += r[i + 1]
            xs.append(x); ys.append(y)
        return max(max(xs) - min(xs), max(ys) - min(ys)) / 100
    ext = [poly_extent(pl) for pl in cand]
    biggest = ext.index(max(ext))
    kept = [pl for i, pl in enumerate(cand) if i == biggest or ext[i] >= MIN_EXTENT]
    out.setdefault(code, []).extend(kept)

text = json.dumps(out, separators=(',', ':'))
header = ("// Automatisch erzeugt von scripts/build-countries.py aus Natural Earth 1:50m Admin 0 – Countries (gemeinfrei, naturalearthdata.com).\n"
          "// Nicht von Hand ändern. Format siehe Kopf des Skripts. Koordinaten in Hundertstelgrad (Länge, Breite).\n")
open('src/geo/countryData.ts', 'w', encoding='utf-8').write(header + 'export const COUNTRY_DATA: string = ' + json.dumps(text) + ';\n')
pts = sum(len(r) // 2 for polys in out.values() for pl in polys for r in pl)
print(f'Länder: {len(out)}, Punkte: {pts}, JSON: {len(text)/1024:.0f} KB')
