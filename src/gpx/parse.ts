import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { NewTrackPoint, NewWaypoint } from '../db/types';

export class GpxError extends Error {}

export interface ParsedTrack {
  name: string | null;
  points: NewTrackPoint[];
}

export interface ParsedGpx {
  name: string | null;
  tracks: ParsedTrack[];
  waypoints: NewWaypoint[];
  warnings: string[];
}

type XmlNode = Record<string, unknown>;

const ARRAY_TAGS = new Set(['trk', 'trkseg', 'trkpt', 'wpt', 'rte', 'rtept']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (tagName) => ARRAY_TAGS.has(tagName),
});

function isNode(v: unknown): v is XmlNode {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (isNode(v) && typeof v['#text'] === 'string') return v['#text'].trim();
  return '';
}

function num(v: unknown): number | null {
  const t = text(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function timeMs(v: unknown): number | null {
  const t = text(v);
  if (!t) return null;
  const n = Date.parse(t);
  return Number.isNaN(n) ? null : n;
}

interface RawPoint {
  lat: number;
  lon: number;
  ele: number | null;
  time: number | null;
  name: string | null;
}

function readPoint(v: unknown): RawPoint | null {
  if (!isNode(v)) return null;
  const lat = num(v['@_lat']);
  const lon = num(v['@_lon']);
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon, ele: num(v.ele), time: timeMs(v.time), name: text(v.name) || null };
}

function readPoints(rawPoints: unknown[], segment: number, out: NewTrackPoint[]): number {
  let skipped = 0;
  for (const raw of rawPoints) {
    const p = readPoint(raw);
    if (!p) {
      skipped++;
      continue;
    }
    out.push({ segment, lat: p.lat, lon: p.lon, ele: p.ele, time: p.time, accuracy: null });
  }
  return skipped;
}

/**
 * Liest GPX 1.0/1.1. Unterstützt mehrere Tracks und Segmente, Waypoints, fehlende Höhen/Zeiten/Namen.
 * Enthält die Datei nur Routen (<rte>), werden diese als Tracks übernommen.
 * Unbekannte Erweiterungen (<extensions>) werden ignoriert.
 */
export function parseGpx(xml: string): ParsedGpx {
  const source = xml.replace(/^﻿/, '');
  const valid = XMLValidator.validate(source);
  if (valid !== true) {
    throw new GpxError(`Ungültiges XML: ${valid.err.msg}`);
  }
  const doc = parser.parse(source) as XmlNode;
  const root = doc.gpx;
  if (!isNode(root)) throw new GpxError('Keine gültige GPX-Datei (Wurzelelement <gpx> fehlt).');

  const warnings: string[] = [];
  const metadata = isNode(root.metadata) ? root.metadata : {};
  const gpxName = text(metadata.name) || null;

  const tracks: ParsedTrack[] = [];
  asArray(root.trk).forEach((trk, i) => {
    if (!isNode(trk)) return;
    const points: NewTrackPoint[] = [];
    let skipped = 0;
    let segment = 0;
    for (const seg of asArray(trk.trkseg)) {
      if (!isNode(seg)) continue;
      const before = points.length;
      skipped += readPoints(asArray(seg.trkpt), segment, points);
      if (points.length > before) segment++;
    }
    if (skipped > 0) warnings.push(`Track ${i + 1}: ${skipped} Punkt(e) mit ungültigen Koordinaten übersprungen.`);
    if (points.length === 0) {
      warnings.push(`Track ${i + 1} enthält keine gültigen Punkte und wird ignoriert.`);
      return;
    }
    tracks.push({ name: text(trk.name) || null, points });
  });

  if (tracks.length === 0) {
    asArray(root.rte).forEach((rte, i) => {
      if (!isNode(rte)) return;
      const points: NewTrackPoint[] = [];
      const skipped = readPoints(asArray(rte.rtept), 0, points);
      if (skipped > 0) warnings.push(`Route ${i + 1}: ${skipped} Punkt(e) mit ungültigen Koordinaten übersprungen.`);
      if (points.length === 0) return;
      warnings.push(`Route ${i + 1} wurde als Track importiert.`);
      tracks.push({ name: text(rte.name) || null, points });
    });
  }

  const waypoints: NewWaypoint[] = [];
  let skippedWpt = 0;
  for (const raw of asArray(root.wpt)) {
    const p = readPoint(raw);
    if (!p) {
      skippedWpt++;
      continue;
    }
    waypoints.push({ lat: p.lat, lon: p.lon, name: p.name ?? '', ele: p.ele, time: p.time });
  }
  if (skippedWpt > 0) warnings.push(`${skippedWpt} Waypoint(s) mit ungültigen Koordinaten übersprungen.`);

  if (tracks.length === 0 && waypoints.length === 0) {
    throw new GpxError('Die Datei enthält weder Tracks noch Routen noch Waypoints.');
  }
  return { name: gpxName, tracks, waypoints, warnings };
}
