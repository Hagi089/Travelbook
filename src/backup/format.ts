/**
 * Backup-Format (Phase 8a). Ein ZIP-Archiv mit:
 *   manifest.json                 Kennung, Formatversion, Erstelldatum, Anzahlen, Einstellungen
 *   data/categories.json          Category[]
 *   data/tours.json               Tour[]
 *   data/waypoints.json           Waypoint[]
 *   data/photos.json              PhotoMeta[] (Metadaten; die Bilddaten liegen unter photos/)
 *   data/meta.json                MetaEntry[]
 *   data/tracks/<tourId>.json     Trackpunkte einer Tour (ohne tourId), nur für Touren mit Punkten
 *   photos/<photoId>.<ext>        Foto-Bytes unverändert
 *
 * Alles aus dem Archiv gilt als nicht vertrauenswürdig: Die Funktionen unten prüfen Typen und Wertebereiche und
 * übernehmen nur bekannte Felder. Reine Funktionen, keine Datenbank- oder Browser-Abhängigkeit (getestet ohne DB).
 */
import type { Category, LatLon, MetaEntry, Tour, TourSource, TrackPoint, Waypoint } from '../db/types';

export const BACKUP_FORMAT = 'travelbook-backup';
export const BACKUP_VERSION = 1;
export const MAX_PHOTOS_PER_TOUR_IN_BACKUP = 3;

export interface BackupCounts {
  categories: number;
  tours: number;
  trackPoints: number;
  waypoints: number;
  photos: number;
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** Unix-Millisekunden (UTC). */
  createdAt: number;
  counts: BackupCounts;
  /** Gesicherte Einstellungen (Schlüssel → Text), siehe settings.ts. */
  settings: Record<string, string>;
}

export interface PhotoMeta {
  id: string;
  tourId: string;
  mimeType: string;
  width: number;
  height: number;
  createdAt: number;
}

export type BackupTrackPoint = Omit<TrackPoint, 'tourId'>;

export const MANIFEST_FILE = 'manifest.json';
export const CATEGORIES_FILE = 'data/categories.json';
export const TOURS_FILE = 'data/tours.json';
export const WAYPOINTS_FILE = 'data/waypoints.json';
export const PHOTOS_FILE = 'data/photos.json';
export const META_FILE = 'data/meta.json';

export function trackFileName(tourId: string): string {
  return `data/tracks/${tourId}.json`;
}

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export function photoFileName(id: string, mimeType: string): string {
  return `photos/${id}.${MIME_EXT[mimeType] ?? 'bin'}`;
}

/** Deutsche Fehlermeldung für ein ungültiges Backup. */
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

function bad(what: string): never {
  throw new BackupError(`Das Backup ist ungültig: ${what}`);
}

type Rec = Record<string, unknown>;

function rec(x: unknown, what: string): Rec {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) bad(`${what} ist kein Objekt.`);
  return x as Rec;
}

function str(o: Rec, key: string, what: string): string {
  const v = o[key];
  if (typeof v !== 'string') bad(`${what}: Feld "${key}" fehlt oder ist kein Text.`);
  return v;
}

function num(o: Rec, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${what}: Feld "${key}" fehlt oder ist keine Zahl.`);
  return v;
}

function numOrNull(o: Rec, key: string, what: string): number | null {
  const v = o[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${what}: Feld "${key}" ist keine Zahl.`);
  return v;
}

function int(o: Rec, key: string, what: string): number {
  const v = num(o, key, what);
  if (!Number.isInteger(v) || v < 0) bad(`${what}: Feld "${key}" ist keine natürliche Zahl.`);
  return v;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && ID_PATTERN.test(v);
}

function id(o: Rec, key: string, what: string): string {
  const v = o[key];
  if (!isSafeId(v)) bad(`${what}: Feld "${key}" ist keine gültige Kennung.`);
  return v;
}

function latLon(x: unknown, what: string): LatLon | null {
  if (x === null || x === undefined) return null;
  const o = rec(x, what);
  const lat = num(o, 'lat', what);
  const lon = num(o, 'lon', what);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) bad(`${what}: Koordinaten außerhalb des gültigen Bereichs.`);
  return { lat, lon };
}

export function parseManifest(x: unknown): BackupManifest {
  const o = rec(x, 'manifest.json');
  if (o.format !== BACKUP_FORMAT) throw new BackupError('Das ist kein Travelbook-Backup (Kennung fehlt).');
  const version = num(o, 'version', 'manifest.json');
  if (!Number.isInteger(version) || version < 1) bad('manifest.json: ungültige Formatversion.');
  if (version > BACKUP_VERSION) {
    throw new BackupError(`Das Backup stammt aus einer neueren App-Version (Format ${version}, diese App versteht bis Format ${BACKUP_VERSION}). Bitte die App aktualisieren.`);
  }
  const counts = rec(o.counts, 'manifest.json: counts');
  const settingsRaw = o.settings === undefined ? {} : rec(o.settings, 'manifest.json: settings');
  const settings: Record<string, string> = {};
  for (const [k, v] of Object.entries(settingsRaw)) if (typeof v === 'string') settings[k] = v;
  return {
    format: BACKUP_FORMAT,
    version,
    createdAt: num(o, 'createdAt', 'manifest.json'),
    counts: {
      categories: int(counts, 'categories', 'manifest.json: counts'),
      tours: int(counts, 'tours', 'manifest.json: counts'),
      trackPoints: int(counts, 'trackPoints', 'manifest.json: counts'),
      waypoints: int(counts, 'waypoints', 'manifest.json: counts'),
      photos: int(counts, 'photos', 'manifest.json: counts'),
    },
    settings,
  };
}

/** Ersatzfarbe für ungültige Farbangaben (wie neue Kategorien in den Einstellungen). */
export const FALLBACK_CATEGORY_COLOR = '#607d8b';

/**
 * Die Farbe landet in der Oberfläche in einem `style`-Attribut. Aus einer (evtl. fremden) Backup-Datei wird deshalb nur
 * eine Hex-Farbe übernommen, wie sie die Farbauswahl der App erzeugt; alles andere wird durch die Ersatzfarbe ersetzt.
 */
export function sanitizeColor(v: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : FALLBACK_CATEGORY_COLOR;
}

export function parseCategory(x: unknown): Category {
  const o = rec(x, 'Kategorie');
  const name = str(o, 'name', 'Kategorie').trim();
  if (!name) bad('Kategorie ohne Namen.');
  return {
    id: id(o, 'id', 'Kategorie'),
    name,
    color: sanitizeColor(str(o, 'color', 'Kategorie')),
    sortOrder: num(o, 'sortOrder', 'Kategorie'),
    isDefault: o.isDefault === true,
    createdAt: num(o, 'createdAt', 'Kategorie'),
    updatedAt: num(o, 'updatedAt', 'Kategorie'),
  };
}

const SOURCES: ReadonlyArray<TourSource> = ['gpx-import', 'recording', 'manual'];

export function parseTour(x: unknown): Tour {
  const o = rec(x, 'Tour');
  const tourId = id(o, 'id', 'Tour');
  const what = `Tour ${tourId}`;
  const date = str(o, 'date', what);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) bad(`${what}: Datum "${date}" ist ungültig.`);
  const source = o.source;
  if (!SOURCES.includes(source as TourSource)) bad(`${what}: unbekannte Quelle.`);
  const tour: Tour = {
    id: tourId,
    name: str(o, 'name', what),
    categoryId: id(o, 'categoryId', what),
    date,
    startTime: numOrNull(o, 'startTime', what),
    endTime: numOrNull(o, 'endTime', what),
    durationSec: num(o, 'durationSec', what),
    distanceM: num(o, 'distanceM', what),
    ascentM: num(o, 'ascentM', what),
    descentM: num(o, 'descentM', what),
    avgSpeedMs: num(o, 'avgSpeedMs', what),
    maxSpeedMs: num(o, 'maxSpeedMs', what),
    startPoint: latLon(o.startPoint, `${what}: Startpunkt`),
    endPoint: latLon(o.endPoint, `${what}: Endpunkt`),
    notes: typeof o.notes === 'string' ? o.notes : '',
    source: source as TourSource,
    createdAt: num(o, 'createdAt', what),
    updatedAt: num(o, 'updatedAt', what),
  };
  if (o.countryCode !== undefined) {
    if (o.countryCode !== null && !(typeof o.countryCode === 'string' && /^[A-Za-z]{2}$/.test(o.countryCode))) bad(`${what}: ungültiger Ländercode.`);
    tour.countryCode = o.countryCode === null ? null : (o.countryCode as string).toUpperCase();
  }
  if (o.countryManual !== undefined) tour.countryManual = o.countryManual === true;
  return tour;
}

export function parseWaypoint(x: unknown): Waypoint {
  const o = rec(x, 'Waypoint');
  const wid = id(o, 'id', 'Waypoint');
  const what = `Waypoint ${wid}`;
  const p = latLon(o, what);
  if (!p) bad(`${what}: Koordinaten fehlen.`);
  return { id: wid, tourId: id(o, 'tourId', what), lat: p.lat, lon: p.lon, name: typeof o.name === 'string' ? o.name : '', ele: numOrNull(o, 'ele', what), time: numOrNull(o, 'time', what) };
}

export function parsePhotoMeta(x: unknown): PhotoMeta {
  const o = rec(x, 'Foto');
  const pid = id(o, 'id', 'Foto');
  const what = `Foto ${pid}`;
  return { id: pid, tourId: id(o, 'tourId', what), mimeType: str(o, 'mimeType', what), width: int(o, 'width', what), height: int(o, 'height', what), createdAt: num(o, 'createdAt', what) };
}

export function parseMetaEntry(x: unknown): MetaEntry {
  const o = rec(x, 'Metadateneintrag');
  const key = str(o, 'key', 'Metadateneintrag');
  if (key.length === 0 || key.length > 100) bad('Metadateneintrag mit ungültigem Schlüssel.');
  return { key, value: o.value };
}

export function parseTrackPoint(x: unknown, tourId: string): BackupTrackPoint {
  const o = rec(x, `Trackpunkt in ${tourId}`);
  const what = `Trackpunkt in ${tourId}`;
  const p = latLon(o, what);
  if (!p) bad(`${what}: Koordinaten fehlen.`);
  return { seq: int(o, 'seq', what), segment: int(o, 'segment', what), lat: p.lat, lon: p.lon, ele: numOrNull(o, 'ele', what), time: numOrNull(o, 'time', what), accuracy: numOrNull(o, 'accuracy', what) };
}

/** Prüft und liest eine Liste: Datei muss ein JSON-Array sein, jedes Element wird mit `parse` geprüft. */
export function parseList<T>(x: unknown, file: string, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(x)) bad(`${file} ist keine Liste.`);
  return x.map(parse);
}

/** Wirft, wenn Kennungen doppelt vorkommen. */
export function assertUnique(ids: string[], what: string): void {
  const seen = new Set<string>();
  for (const i of ids) {
    if (seen.has(i)) bad(`${what} "${i}" kommt doppelt vor.`);
    seen.add(i);
  }
}
