import { circleMarker, latLngBounds, map as createMap, polyline, tileLayer, type LatLngBounds, type LayerGroup, type Map as LMap, type Path, type TileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTrackPoints, listCategories, listTours, type Category, type GpxDb } from '../db-api';
import { getMapMode } from '../map/mapMode';
import { toSegments } from '../map/simplify';
import { createCountryBase, type CountryBase, type CountryBaseColors } from '../map/countryLayer';
import { getMapBackground, MAP_MAX_ZOOM } from '../map/tileSource';
import { h, type View } from './dom';
import { icon } from './icons';
import { createOnlineNotice } from './onlineNotice';

/** Kartenansicht. Ein Klick auf eine Route oder einen Punkt öffnet die Details der Tour (`onOpenTour`). */
export function createMapView(db: GpxDb, onOpenTour: (tourId: string) => void): View {
  const chips = h('div', { class: 'chips' });
  const mapEl = h('div', { class: 'map' });
  const notice = createOnlineNotice(); // TEMP-ONLINE-MAP
  const OFFLINE_NOTICE = 'Offline-Karte: grobe Weltkarte aus Ländergrenzen, ohne Straßen und Orte. Funktioniert ohne Internet.';
  const offlineNotice = h('div', { class: 'notice', role: 'status', hidden: '' }, OFFLINE_NOTICE);
  const el = h('section', { class: 'view map-view', hidden: '' }, chips, notice, offlineNotice, mapEl);

  let map: LMap | null = null;
  let tiles: TileLayer | null = null;
  let baseLayer: LayerGroup | null = null;
  let base: CountryBase | null = null;
  let baseAttribution = '';
  let baseToken = 0;
  let baseState: 'none' | 'loading' | 'ready' = 'none';
  let lines: Path[] = [];
  let categoryFilter: string | null = null;
  let fittedKey = '';
  let token = 0;

  /** Farben der Offline-Weltkarte aus den CSS-Variablen `--map-*` (hell/dunkel, siehe styles.css). */
  function baseColors(): CountryBaseColors {
    const css = getComputedStyle(mapEl);
    return { land: css.getPropertyValue('--map-land').trim() || '#eef1e4', border: css.getPropertyValue('--map-border').trim() || '#9aa79a' };
  }

  function clearBase(): void {
    baseToken++;
    baseLayer?.remove();
    baseLayer = null;
    base = null;
    baseState = 'none';
    if (baseAttribution) map?.attributionControl.removeAttribution(baseAttribution);
    baseAttribution = '';
  }

  function applyTileSource(): void {
    if (!map) return;
    const activeMap = map;
    const bg = getMapBackground(getMapMode());
    if (bg.kind === 'countries' && baseState !== 'none') return; // Offline-Weltkarte steht schon bzw. wird gerade geladen
    // Online-Kacheln stehen schon: nicht bei jedem Öffnen der Karte neu anlegen (spart Kachel-Abrufe bei OSM, kein Flackern).
    if (bg.kind === 'tiles' && tiles) return;
    tiles?.remove();
    tiles = null;
    clearBase();
    notice.hidden = bg.kind !== 'tiles'; // TEMP-ONLINE-MAP
    offlineNotice.hidden = bg.kind !== 'countries';
    mapEl.classList.toggle('offline-base', bg.kind === 'countries');
    if (bg.kind === 'tiles') {
      tiles = tileLayer(bg.source.urlTemplate, { attribution: bg.source.attribution, maxZoom: bg.source.maxZoom }).addTo(activeMap);
      return;
    }
    const mine = baseToken;
    baseState = 'loading';
    offlineNotice.textContent = OFFLINE_NOTICE;
    offlineNotice.classList.remove('notice-warn');
    baseAttribution = bg.base.attribution;
    activeMap.attributionControl.addAttribution(baseAttribution);
    createCountryBase(activeMap, baseColors())
      .then((created) => {
        if (mine !== baseToken || map !== activeMap) return; // Modus wurde inzwischen gewechselt
        base = created;
        baseLayer = created.layer.addTo(activeMap);
        baseState = 'ready';
      })
      .catch((e: unknown) => {
        if (mine !== baseToken) return;
        baseState = 'none'; // nächster Besuch der Karte versucht es erneut
        offlineNotice.textContent = `Die Ländergrenzen für die Offline-Karte konnten nicht geladen werden (${e instanceof Error ? e.message : String(e)}). Deine Tracks werden weiterhin angezeigt.`;
        offlineNotice.classList.add('notice-warn');
      });
  }

  // Farbwechsel (hell/dunkel) auch für die Offline-Weltkarte übernehmen.
  window.addEventListener('themechange', () => base?.restyle(baseColors()));

  let categories: Category[] = [];

  function renderChips(): void {
    chips.replaceChildren();
    const add = (label: string, id: string | null, color?: string) => {
      const on = id === categoryFilter;
      const b = h('button', { type: 'button', class: on ? 'chip active' : 'chip', 'aria-pressed': String(on) }, on ? icon('check') : color ? h('span', { class: 'dot', style: `background:${color}` }) : null, label);
      b.addEventListener('click', () => {
        categoryFilter = id;
        void refresh();
      });
      chips.append(b);
    };
    add('Alle', null);
    for (const c of categories) add(c.name, c.id, c.color);
  }

  async function refresh(): Promise<void> {
    if (!map) return;
    const my = ++token;
    categories = await listCategories(db);
    renderChips();
    const tours = await listTours(db, categoryFilter ? { categoryId: categoryFilter } : {});
    const loaded = await Promise.all(tours.map(async (tour) => ({ tour, segments: toSegments(await getTrackPoints(db, tour.id)) })));
    if (my !== token || !map) return; // neuere Aktualisierung läuft
    for (const line of lines) line.remove();
    lines = [];
    let bounds: LatLngBounds | null = null;
    for (const { tour, segments } of loaded) {
      const color = categories.find((c) => c.id === tour.categoryId)?.color ?? '#555555';
      let shape: Path;
      let shapeBounds: LatLngBounds;
      if (segments.length > 0) {
        const pl = polyline(segments, { color, weight: 4, opacity: 0.8 });
        shape = pl;
        shapeBounds = pl.getBounds();
      } else if (tour.startPoint) {
        // Manuell angelegte Tour ohne Track: nur ein Punkt am angegebenen Ort.
        const at: [number, number] = [tour.startPoint.lat, tour.startPoint.lon];
        shape = circleMarker(at, { radius: 9, color, weight: 3, fillColor: color, fillOpacity: 0.7 });
        shapeBounds = latLngBounds([at, at]);
      } else {
        continue;
      }
      shape.addTo(map);
      shape.on('click', () => onOpenTour(tour.id));
      lines.push(shape);
      bounds = bounds ? bounds.extend(shapeBounds) : latLngBounds(shapeBounds.getSouthWest(), shapeBounds.getNorthEast());
    }
    // Ausschnitt nur anpassen, wenn sich Filter oder Tourenauswahl geändert haben (nicht beim Zurückkehren aus den Details).
    const key = `${categoryFilter ?? ''}|${tours.map((t) => t.id).join(',')}`;
    if (bounds && key !== fittedKey) {
      map.fitBounds(bounds, { padding: [24, 24] });
      fittedKey = key;
    }
  }

  return {
    el,
    async onShow() {
      if (!map) {
        // maxZoom fest setzen: Ohne Kachelebene (Offline-Weltkarte) wäre die höchste Zoomstufe sonst "unendlich", und
        // fitBounds auf eine einzelne Position (z. B. Stellplatz ohne Track) würde die Karte unbrauchbar machen.
        map = createMap(mapEl, { worldCopyJump: true, maxZoom: MAP_MAX_ZOOM }).setView([20, 0], 2);
      }
      applyTileSource();
      map.invalidateSize();
      await refresh();
    },
  };
}
