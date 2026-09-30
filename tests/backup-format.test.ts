import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, BACKUP_VERSION, FALLBACK_CATEGORY_COLOR, assertUnique, parseCategory, parseManifest, parsePhotoMeta, parseTour, parseTrackPoint, parseWaypoint, photoFileName } from '../src/backup/format';
import { BACKUP_SETTING_KEYS, applySettings, collectSettings, sanitizeSettings } from '../src/backup/settings';

const tour = {
  id: 't1', name: 'A', categoryId: 'default-wandern', date: '2026-09-01', startTime: 1, endTime: 2, durationSec: 1, distanceM: 1, ascentM: 0, descentM: 0,
  avgSpeedMs: 0, maxSpeedMs: 0, startPoint: { lat: 1, lon: 2 }, endPoint: null, notes: 'n', source: 'manual', createdAt: 1, updatedAt: 2,
};

describe('Backup-Format: Prüfung', () => {
  it('übernimmt eine gültige Tour und lässt unbekannte Felder weg', () => {
    const t = parseTour({ ...tour, evil: '<script>', countryCode: 'de', countryManual: true });
    expect(t).toMatchObject({ id: 't1', countryCode: 'DE', countryManual: true });
    expect('evil' in t).toBe(false);
  });
  it('lehnt ungültige Touren ab', () => {
    expect(() => parseTour({ ...tour, id: '../x' })).toThrow('Kennung');
    expect(() => parseTour({ ...tour, date: '1.9.2026' })).toThrow('Datum');
    expect(() => parseTour({ ...tour, source: 'x' })).toThrow('Quelle');
    expect(() => parseTour({ ...tour, distanceM: 'a' })).toThrow('distanceM');
    expect(() => parseTour({ ...tour, startPoint: { lat: 91, lon: 0 } })).toThrow('Koordinaten');
    expect(() => parseTour({ ...tour, countryCode: 'DEU' })).toThrow('Ländercode');
    expect(() => parseTour(null)).toThrow('kein Objekt');
  });
  it('prüft Manifest, Kennung und Formatversion', () => {
    const base = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: 5, counts: { categories: 1, tours: 2, trackPoints: 3, waypoints: 4, photos: 5 }, settings: { a: 'b', c: 1 } };
    expect(parseManifest(base).settings).toEqual({ a: 'b' });
    expect(() => parseManifest({ ...base, format: 'x' })).toThrow('kein Travelbook-Backup');
    expect(() => parseManifest({ ...base, version: BACKUP_VERSION + 1 })).toThrow('neueren App-Version');
    expect(() => parseManifest({ ...base, counts: { categories: -1 } })).toThrow();
  });
  it('prüft Kategorien, Waypoints, Fotos und Trackpunkte', () => {
    expect(() => parseCategory({ id: 'c', name: '  ', color: '#fff', sortOrder: 0, createdAt: 1, updatedAt: 1 })).toThrow('Namen');
    expect(parseWaypoint({ id: 'w', tourId: 't', lat: 1, lon: 2, name: 'x', ele: null, time: null }).name).toBe('x');
    expect(() => parsePhotoMeta({ id: 'p', tourId: 't', mimeType: 'image/jpeg', width: -1, height: 1, createdAt: 1 })).toThrow('natürliche Zahl');
    expect(parseTrackPoint({ seq: 0, segment: 0, lat: 1, lon: 2, ele: null, time: 5, accuracy: 3 }, 't')).toEqual({ seq: 0, segment: 0, lat: 1, lon: 2, ele: null, time: 5, accuracy: 3 });
    expect(() => parseTrackPoint({ seq: 0, segment: 0, lat: 1, lon: 200 }, 't')).toThrow('Koordinaten');
  });
  it('übernimmt nur Hex-Farben (Farbe landet in einem style-Attribut)', () => {
    const cat = { id: 'c', name: 'K', sortOrder: 0, createdAt: 1, updatedAt: 1 };
    expect(parseCategory({ ...cat, color: '#1E88e5' }).color).toBe('#1E88e5');
    expect(parseCategory({ ...cat, color: 'red;background-image:url(https://example.org/x)' }).color).toBe(FALLBACK_CATEGORY_COLOR);
    expect(parseCategory({ ...cat, color: '#fff' }).color).toBe(FALLBACK_CATEGORY_COLOR);
  });
  it('erkennt doppelte Kennungen und bildet Foto-Dateinamen', () => {
    expect(() => assertUnique(['a', 'b', 'a'], 'Tour')).toThrow('doppelt');
    expect(photoFileName('p1', 'image/jpeg')).toBe('photos/p1.jpg');
    expect(photoFileName('p1', 'image/x-unknown')).toBe('photos/p1.bin');
  });
});

describe('Backup-Einstellungen', () => {
  it('behält nur bekannte Schlüssel mit erlaubten Werten', () => {
    expect(sanitizeSettings({ 'gpx-tracker.theme': 'dark', 'gpx-tracker.mapMode': 'wild', other: 'x' })).toEqual({ 'gpx-tracker.theme': 'dark' });
    expect(sanitizeSettings({ 'gpx-tracker.theme': 'system', 'gpx-tracker.mapMode': 'online' })).toEqual({ 'gpx-tracker.theme': 'system', 'gpx-tracker.mapMode': 'online' });
  });
  it('sammelt und schreibt Einstellungen über ein Speicherobjekt', () => {
    const store = new Map<string, string>([['gpx-tracker.theme', 'light']]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    expect(collectSettings(storage)).toEqual({ 'gpx-tracker.theme': 'light', 'gpx-tracker.mapMode': 'online' });
    expect(applySettings({ 'gpx-tracker.mapMode': 'offline', 'gpx-tracker.theme': 'bad' }, storage)).toBe(1);
    expect(store.get('gpx-tracker.mapMode')).toBe('offline');
    expect(store.get('gpx-tracker.theme')).toBe('light');
    expect(BACKUP_SETTING_KEYS).toHaveLength(2);
  });
  it('sichert „System“ (fehlender Eintrag) ausdrücklich und setzt es beim Wiederherstellen zurück', () => {
    const store = new Map<string, string>([['gpx-tracker.theme', 'dark']]);
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const fromSystemDevice = collectSettings({ getItem: () => null });
    expect(fromSystemDevice).toEqual({ 'gpx-tracker.theme': 'system', 'gpx-tracker.mapMode': 'online' });
    applySettings(fromSystemDevice, storage);
    expect(store.has('gpx-tracker.theme')).toBe(false); // wieder „System“
    expect(store.get('gpx-tracker.mapMode')).toBe('online');
  });
});
