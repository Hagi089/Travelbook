import type { NewTrackPoint, NewWaypoint } from '../db/types';

export interface ExportInput {
  name: string;
  notes?: string;
  points: ReadonlyArray<NewTrackPoint>;
  waypoints?: ReadonlyArray<NewWaypoint>;
}

function esc(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: number, digits: number): string {
  let s = n.toFixed(digits);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Erzeugt GPX 1.1 (Elementreihenfolge laut Schema: wpt vor trk; ele vor time). */
export function exportGpx(input: ExportInput): string {
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    '<gpx version="1.1" creator="GPX Tracker" xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
  );

  for (const w of input.waypoints ?? []) {
    out.push(`  <wpt lat="${fmt(w.lat, 7)}" lon="${fmt(w.lon, 7)}">`);
    if (w.ele !== null) out.push(`    <ele>${fmt(w.ele, 2)}</ele>`);
    if (w.time !== null) out.push(`    <time>${iso(w.time)}</time>`);
    if (w.name) out.push(`    <name>${esc(w.name)}</name>`);
    out.push('  </wpt>');
  }

  out.push('  <trk>');
  if (input.name) out.push(`    <name>${esc(input.name)}</name>`);
  if (input.notes) out.push(`    <desc>${esc(input.notes)}</desc>`);

  let currentSegment: number | null = null;
  for (const p of input.points) {
    if (p.segment !== currentSegment) {
      if (currentSegment !== null) out.push('    </trkseg>');
      out.push('    <trkseg>');
      currentSegment = p.segment;
    }
    out.push(`      <trkpt lat="${fmt(p.lat, 7)}" lon="${fmt(p.lon, 7)}">`);
    if (p.ele !== null) out.push(`        <ele>${fmt(p.ele, 2)}</ele>`);
    if (p.time !== null) out.push(`        <time>${iso(p.time)}</time>`);
    out.push('      </trkpt>');
  }
  if (currentSegment !== null) out.push('    </trkseg>');
  out.push('  </trk>');
  out.push('</gpx>');
  return out.join('\n') + '\n';
}
