import { circleMarker, latLngBounds, map as createMap, polyline, tileLayer, type LatLngBounds, type Map as LMap, type Path, type TileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTrackPoints, listCategories, listTours, type Category, type GpxDb } from '../db-api';
import { getMapMode } from '../map/mapMode';
import { toSegments } from '../map/simplify';
import { getTileSource } from '../map/tileSource';
import { h, type View } from './dom';
import { icon } from './icons';
import { createOnlineNotice } from './onlineNotice';

/** Kartenansicht. Ein Klick auf eine Route oder einen Punkt öffnet die Details der Tour (`onOpenTour`). */
export function createMapView(db: GpxDb, onOpenTour: (tourId: string) => void): View {
  const chips = h('div', { class: 'chips' });
  const mapEl = h('div', { class: 'map' });
  const notice = createOnlineNotice(); // TEMP-ONLINE-MAP
  const el = h('section', { class: 'view map-view', hidden: '' }, chips, notice, mapEl);

  let map: LMap | null = null;
  let tiles: TileLayer | null = null;
  let lines: Path[] = [];
  let categoryFilter: string | null = null;
  let fittedKey = '';
  let token = 0;

  function applyTileSource(): void {
    if (!map) return;
    tiles?.remove();
    tiles = null;
    const src = getTileSource(getMapMode());
    notice.hidden = !src?.requiresInternet; // TEMP-ONLINE-MAP
    if (src) {
      tiles = tileLayer(src.urlTemplate, { attribution: src.attribution, maxZoom: src.maxZoom }).addTo(map);
    }
  }

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
        map = createMap(mapEl, { worldCopyJump: true }).setView([20, 0], 2);
      }
      applyTileSource();
      map.invalidateSize();
      await refresh();
    },
  };
}
