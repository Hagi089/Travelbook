import { latLngBounds, map as createMap, polyline, tileLayer, type LatLngBounds, type Map as LMap, type Polyline, type TileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { deleteTour, exportGpx, getTrackPoints, listCategories, listTours, type Category, type GpxDb, type Tour } from '../db-api';
import { getMapMode } from '../map/mapMode';
import { toSegments } from '../map/simplify';
import { getTileSource } from '../map/tileSource';
import { h, type View } from './dom';
import { formatDistance, formatDuration, formatElevation, formatSpeed } from './format';
import { createOnlineNotice } from './onlineNotice';

function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }));
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function createMapView(db: GpxDb): View {
  const chips = h('div', { class: 'chips' });
  const mapEl = h('div', { class: 'map' });
  const panel = h('div', { class: 'panel', hidden: '' });
  const notice = createOnlineNotice(); // TEMP-ONLINE-MAP
  const el = h('section', { class: 'view map-view', hidden: '' }, chips, notice, mapEl, panel);

  let map: LMap | null = null;
  let tiles: TileLayer | null = null;
  let lines: Array<{ tour: Tour; line: Polyline }> = [];
  let categoryFilter: string | null = null;
  let selectedId: string | null = null;
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

  function highlight(): void {
    for (const { tour, line } of lines) {
      const sel = tour.id === selectedId;
      line.setStyle({ weight: sel ? 7 : 4, opacity: sel ? 1 : 0.8 });
      if (sel) line.bringToFront();
    }
  }

  function showPanel(tour: Tour | null, category: Category | undefined): void {
    panel.replaceChildren();
    if (!tour) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const exportBtn = h('button', { type: 'button' }, 'GPX exportieren');
    const delBtn = h('button', { type: 'button', class: 'danger' }, 'Löschen');
    exportBtn.addEventListener('click', async () => {
      const points = await getTrackPoints(db, tour.id);
      const waypoints = await db.waypoints.where('tourId').equals(tour.id).toArray();
      downloadText(`${tour.name.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'tour'}.gpx`, exportGpx({ name: tour.name, notes: tour.notes, points, waypoints }));
    });
    delBtn.addEventListener('click', async () => {
      if (!window.confirm(`Tour "${tour.name}" wirklich löschen?`)) return;
      await deleteTour(db, tour.id);
      selectedId = null;
      await refresh();
    });
    panel.append(
      h('strong', {}, tour.name),
      h('div', { class: 'muted' }, `${category?.name ?? 'Ohne Kategorie'} · ${tour.date}`),
      h(
        'div',
        { class: 'stats' },
        `${formatDistance(tour.distanceM)} · ↑ ${formatElevation(tour.ascentM)} · ↓ ${formatElevation(tour.descentM)} · ${formatDuration(tour.durationSec)} · Ø ${formatSpeed(tour.avgSpeedMs)}`,
      ),
      tour.notes ? h('div', { class: 'notes' }, tour.notes) : null,
      h('div', { class: 'row' }, exportBtn, delBtn),
    );
  }

  let categories: Category[] = [];

  function select(tour: Tour | null): void {
    selectedId = tour?.id ?? null;
    highlight();
    showPanel(tour, categories.find((c) => c.id === tour?.categoryId));
  }

  function renderChips(): void {
    chips.replaceChildren();
    const add = (label: string, id: string | null, color?: string) => {
      const b = h('button', { type: 'button', class: id === categoryFilter ? 'chip active' : 'chip' }, color ? h('span', { class: 'dot', style: `background:${color}` }) : null, label);
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
    for (const { line } of lines) line.remove();
    lines = [];
    let bounds: LatLngBounds | null = null;
    for (const { tour, segments } of loaded) {
      if (segments.length === 0) continue;
      const color = categories.find((c) => c.id === tour.categoryId)?.color ?? '#555555';
      const line = polyline(segments, { color, weight: 4, opacity: 0.8 }).addTo(map);
      line.on('click', () => select(tour));
      lines.push({ tour, line });
      bounds = bounds ? bounds.extend(line.getBounds()) : latLngBounds(line.getBounds().getSouthWest(), line.getBounds().getNorthEast());
    }
    if (bounds) map.fitBounds(bounds, { padding: [24, 24] });
    const stillSelected = tours.find((t) => t.id === selectedId) ?? null;
    select(stillSelected);
  }

  return {
    el,
    async onShow() {
      if (!map) {
        map = createMap(mapEl, { worldCopyJump: true }).setView([20, 0], 2);
        map.on('click', () => select(null));
      }
      applyTileSource();
      map.invalidateSize();
      await refresh();
    },
  };
}
