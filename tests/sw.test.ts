import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const SCOPE = 'https://example.org/Travelbook/';
const FILES = ['index.html', 'assets/app-abc.js', 'assets/countries-def.js', 'manifest.webmanifest', 'icons/icon-192.png'];

type Handler = (event: unknown) => void;

/** Führt die Service-Worker-Vorlage mit Attrappen für Cache, Netz und Ereignisse aus. */
function loadWorker(options: { network?: (url: string) => Response | Promise<Response>; existingCaches?: string[] } = {}) {
  const template = readFileSync(new URL('../scripts/sw.template.js', import.meta.url), 'utf8');
  const code = template.split('__VERSION__').join('v1').split('__PRECACHE__').join(JSON.stringify(FILES));
  const handlers = new Map<string, Handler>();
  const stores = new Map<string, Map<string, Response>>();
  for (const name of options.existingCaches ?? []) stores.set(name, new Map());
  const fetched: string[] = [];
  const state = { skipped: 0, claimed: 0 };

  const key = (r: Request | string, ignoreSearch = false): string => {
    const u = new URL(typeof r === 'string' ? r : r.url);
    return ignoreSearch ? u.origin + u.pathname : u.href;
  };
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async put(r: Request | string, res: Response) {
          store.set(key(r), res);
        },
        async match(r: Request | string, opts: { ignoreSearch?: boolean } = {}) {
          for (const [k, v] of store) if (key(k, opts.ignoreSearch) === key(r, opts.ignoreSearch)) return v.clone();
          return undefined;
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
  const network = options.network ?? ((url: string) => new Response('net:' + url, { status: 200 }));
  const self = {
    registration: { scope: SCOPE },
    location: { origin: 'https://example.org' },
    clients: { claim: async () => void state.claimed++ },
    skipWaiting: () => void state.skipped++,
    addEventListener: (type: string, fn: Handler) => void handlers.set(type, fn),
  };
  runInNewContext(code, {
    self,
    caches,
    fetch: async (r: Request | string) => {
      const url = typeof r === 'string' ? r : r.url;
      fetched.push(url);
      return network(url);
    },
    Request,
    Response,
    URL,
    Promise,
  });

  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    let waited: Promise<unknown> = Promise.resolve();
    let responded: Promise<Response> | undefined;
    const event = { ...extra, waitUntil: (p: Promise<unknown>) => (waited = p), respondWith: (p: Promise<Response>) => {
        p.catch(() => undefined); // Ablehnung wird im Test ausdrücklich erwartet
        responded = p;
      },
    };
    handlers.get(type)!(event);
    await waited;
    return { responded };
  }
  return { dispatch, stores, fetched, state };
}

const req = (path: string, init: { method?: string; mode?: string } = {}) => {
  const r = new Request(new URL(path, SCOPE).href, { method: init.method ?? 'GET' });
  return init.mode ? Object.defineProperty(r, 'mode', { value: init.mode }) : r;
};

describe('Service Worker (Vorlage)', () => {
  it('speichert beim Installieren alle App-Dateien und umgeht den HTTP-Cache', async () => {
    const sw = loadWorker();
    await sw.dispatch('install');
    const cache = sw.stores.get('travelbook-v1')!;
    expect([...cache.keys()].sort()).toEqual(FILES.map((f) => SCOPE + f).sort());
    expect(sw.fetched).toHaveLength(FILES.length);
  });

  it('bricht die Installation ab, wenn eine Datei fehlt (alter Service Worker bleibt aktiv)', async () => {
    const sw = loadWorker({ network: (url) => (url.endsWith('countries-def.js') ? new Response('nope', { status: 404 }) : new Response('ok')) });
    await expect(sw.dispatch('install')).rejects.toThrow('Precache fehlgeschlagen');
  });

  it('räumt beim Aktivieren alte Travelbook-Caches auf und übernimmt die Seiten', async () => {
    const sw = loadWorker({ existingCaches: ['travelbook-old', 'travelbook-v1', 'fremd'] });
    await sw.dispatch('activate');
    expect([...sw.stores.keys()].sort()).toEqual(['fremd', 'travelbook-v1']);
    expect(sw.state.claimed).toBe(1);
  });

  it('wartet auf SKIP_WAITING, statt sich selbst zu aktivieren', async () => {
    const sw = loadWorker();
    await sw.dispatch('install');
    expect(sw.state.skipped).toBe(0);
    await sw.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    expect(sw.state.skipped).toBe(1);
    await sw.dispatch('message', { data: { type: 'anderes' } });
    expect(sw.state.skipped).toBe(1);
  });

  it('liefert Navigation und Dateien offline aus dem Cache', async () => {
    const online = loadWorker();
    await online.dispatch('install');
    // gleicher Cache, aber Netz weg
    const offline = loadWorker({ network: () => Promise.reject(new Error('offline')) });
    for (const [name, store] of online.stores) offline.stores.set(name, store);

    const nav = await offline.dispatch('fetch', { request: req('', { mode: 'navigate' }) });
    expect(await (await nav.responded!).text()).toBe('net:' + SCOPE + 'index.html');
    const asset = await offline.dispatch('fetch', { request: req('assets/app-abc.js') });
    expect(await (await asset.responded!).text()).toBe('net:' + SCOPE + 'assets/app-abc.js');
  });

  it('greift bei fremden Herkünften (Kacheln) und Nicht-GET-Anfragen nicht ein', async () => {
    const sw = loadWorker();
    const tile = await sw.dispatch('fetch', { request: new Request('https://tile.openstreetmap.org/3/4/5.png') });
    expect(tile.responded).toBeUndefined();
    const post = await sw.dispatch('fetch', { request: req('x', { method: 'POST' }) });
    expect(post.responded).toBeUndefined();
  });

  it('holt unbekannte Dateien der App aus dem Netz, ohne sie zu speichern; ohne Netz und Cache schlägt es fehl', async () => {
    const sw = loadWorker();
    await sw.dispatch('install');
    const other = await sw.dispatch('fetch', { request: req('extra.json') });
    expect(await (await other.responded!).text()).toBe('net:' + SCOPE + 'extra.json');
    expect(sw.stores.get('travelbook-v1')!.has(SCOPE + 'extra.json')).toBe(false);

    const dead = loadWorker({ network: () => Promise.reject(new Error('offline')) });
    const miss = await dead.dispatch('fetch', { request: req('extra.json') });
    await expect(miss.responded!).rejects.toThrow('offline');
  });

  it('nutzt bei geänderter Query denselben zwischengespeicherten Eintrag, wenn das Netz fehlt', async () => {
    const online = loadWorker();
    await online.dispatch('install');
    const offline = loadWorker({ network: () => Promise.reject(new Error('offline')) });
    for (const [name, store] of online.stores) offline.stores.set(name, store);
    const r = await offline.dispatch('fetch', { request: req('assets/app-abc.js?v=2') });
    expect((await r.responded!).status).toBe(200);
  });
});
