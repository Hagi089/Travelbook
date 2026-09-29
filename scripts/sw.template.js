/*
 * Travelbook Service Worker (Phase 8b). Diese Datei ist eine Vorlage: vite.config.ts (Plugin "travelbook-sw") ersetzt
 * die beiden Platzhalter (Version, Dateiliste) nach dem Build und schreibt das Ergebnis als dist/sw.js.
 *
 * Aufgabe: Die App-Dateien (Oberfläche, Skripte, Länderdaten, Icons, Manifest) einmal laden und danach ohne Netz starten.
 * - Nur Dateien der App selbst werden zwischengespeichert. Kartenkacheln (fremde Herkunft) gehen unverändert ins Netz und
 *   werden NICHT gespeichert (Nutzungsrichtlinie von OpenStreetMap, ARCHITECTURE.md ADR-002).
 * - Ein neuer Service Worker wartet, bis der Nutzer "Neu laden" wählt (Nachricht SKIP_WAITING), damit eine laufende
 *   Aufnahme oder ein offenes Formular nicht unterbrochen wird.
 */
const VERSION = '__VERSION__';
const CACHE = 'travelbook-' + VERSION;
const PRECACHE = __PRECACHE__;

function absolute(path) {
  return new URL(path, self.registration.scope).href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (path) => {
          const url = absolute(path);
          // "reload": nicht aus dem HTTP-Cache, sonst könnte eine alte index.html zu neuen Dateinamen passen.
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (!response.ok) throw new Error('Precache fehlgeschlagen: ' + path + ' (' + response.status + ')');
          await cache.put(url, response);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('travelbook-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return; // Karten-Kacheln u. a.: direkt ins Netz
  event.respondWith(handle(request));
});

async function handle(request) {
  const cache = await caches.open(CACHE);
  if (request.mode === 'navigate') {
    const page = await cache.match(absolute('index.html'));
    return page || fetch(request);
  }
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    return await fetch(request);
  } catch (error) {
    const similar = await cache.match(request, { ignoreSearch: true });
    if (similar) return similar;
    throw error;
  }
}
