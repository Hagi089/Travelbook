import {
  buildLocation,
  createManualTour,
  deleteTour,
  listCategories,
  listTours,
  localDateString,
  parseDecimal,
  updateTourDetails,
  type Category,
  type GpxDb,
  type Tour,
} from '../db-api';
import { h, type View } from './dom';
import { formatDate, formatDistance, formatDuration, formatElevation } from './format';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Tourenliste mit Kategorienfilter, manuellem Anlegen und Bearbeiten (Name, Kategorie, Datum, Notizen). */
export function createToursView(db: GpxDb): View {
  const filter = h('select', { 'aria-label': 'Kategorie filtern' });
  const newBtn = h('button', { type: 'button', class: 'primary' }, '+ Neue Tour');
  const list = h('div', { class: 'tour-list' });
  const listPane = h('div', { class: 'page' }, h('h2', {}, 'Touren'), h('div', { class: 'toolbar' }, filter, newBtn), list);
  const editorPane = h('div', { class: 'page', hidden: '' });
  const el = h('section', { class: 'view scroll', hidden: '' }, listPane, editorPane);

  let categories: Category[] = [];
  let filterId = '';

  function showList(): void {
    editorPane.hidden = true;
    editorPane.replaceChildren();
    listPane.hidden = false;
  }

  function showEditor(node: HTMLElement): void {
    listPane.hidden = true;
    editorPane.replaceChildren(node);
    editorPane.hidden = false;
    el.scrollTop = 0;
  }

  /** Formular zum Anlegen (`tour === null`) oder Bearbeiten einer Tour. */
  function editor(tour: Tour | null): HTMLElement {
    const isManual = tour === null || tour.source === 'manual';
    const name = h('input', { type: 'text', value: tour?.name ?? '' });
    const category = h('select', {}, ...categories.map((c) => h('option', { value: c.id }, c.name)));
    if (tour && categories.some((c) => c.id === tour.categoryId)) category.value = tour.categoryId;
    const date = h('input', { type: 'date', value: tour?.date ?? localDateString(Date.now()) });
    const notes = h('textarea', { rows: '10', placeholder: 'Notizen' });
    notes.value = tour?.notes ?? '';
    const distance = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'optional', value: tour && tour.distanceM > 0 ? String(Number((tour.distanceM / 1000).toFixed(3))).replace('.', ',') : '' });
    const duration = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'optional', value: tour && tour.durationSec > 0 ? String(Math.round(tour.durationSec / 60)) : '' });
    const lat = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 48,137', value: tour?.startPoint ? String(tour.startPoint.lat).replace('.', ',') : '' });
    const lon = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 11,575', value: tour?.startPoint ? String(tour.startPoint.lon).replace('.', ',') : '' });
    const save = h('button', { type: 'button', class: 'primary' }, 'Speichern');
    const back = h('button', { type: 'button' }, 'Zurück');
    const msg = h('div', { class: 'status error', role: 'status' });
    const buttons = h('div', { class: 'row actions' }, save, back);

    if (categories.length === 0) {
      save.disabled = true;
      msg.textContent = 'Es gibt keine Kategorie. Lege zuerst unter „Einstellungen“ eine Kategorie an.';
    }

    back.addEventListener('click', showList);

    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        if (isManual) {
          const km = parseDecimal(distance.value, 'Distanz');
          const min = parseDecimal(duration.value, 'Dauer');
          const location = buildLocation(parseDecimal(lat.value, 'Breite'), parseDecimal(lon.value, 'Länge'));
          const fields = { distanceM: km === null ? null : km * 1000, durationSec: min === null ? null : min * 60, location };
          if (tour) {
            await updateTourDetails(db, tour.id, { name: name.value, categoryId: category.value, date: date.value, notes: notes.value, ...fields });
          } else {
            await createManualTour(db, { name: name.value, categoryId: category.value, date: date.value, notes: notes.value, ...fields });
          }
        } else if (tour) {
          await updateTourDetails(db, tour.id, { name: name.value, categoryId: category.value, date: date.value, notes: notes.value });
        }
        await refresh();
        showList();
      } catch (e) {
        msg.textContent = errorText(e);
        save.disabled = false;
      }
    });

    if (tour) {
      const del = h('button', { type: 'button', class: 'danger ghost' }, 'Löschen');
      del.addEventListener('click', async () => {
        if (!window.confirm(`Tour "${tour.name}" wirklich löschen?`)) return;
        try {
          await deleteTour(db, tour.id);
          await refresh();
          showList();
        } catch (e) {
          msg.textContent = errorText(e);
        }
      });
      buttons.append(del);
    }

    return h(
      'div',
      {},
      h('h2', {}, tour ? 'Tour bearbeiten' : 'Neue Tour'),
      tour && !isManual
        ? h('div', { class: 'muted' }, `${formatDistance(tour.distanceM)} · ↑ ${formatElevation(tour.ascentM)} · ↓ ${formatElevation(tour.descentM)} · ${formatDuration(tour.durationSec)} (aus dem Track berechnet, nicht änderbar)`)
        : null,
      h('label', {}, 'Name', name),
      h('label', {}, 'Kategorie', category),
      h('label', {}, 'Datum', date),
      isManual ? h('div', { class: 'two' }, h('label', {}, 'Distanz in km', distance), h('label', {}, 'Dauer in Minuten', duration)) : null,
      isManual ? h('div', { class: 'muted' }, 'Ort (optional): Ohne Ort erscheint die Tour nur in der Liste, nicht auf der Karte. Breite: Norden positiv, Länge: Osten positiv.') : null,
      isManual ? h('div', { class: 'two' }, h('label', {}, 'Breite (Grad)', lat), h('label', {}, 'Länge (Grad)', lon)) : null,
      h('label', {}, 'Notizen', notes),
      buttons,
      msg,
    );
  }

  function item(tour: Tour): HTMLElement {
    const cat = categories.find((c) => c.id === tour.categoryId);
    const meta = [formatDate(tour.date), cat?.name ?? 'Ohne Kategorie', tour.distanceM > 0 ? formatDistance(tour.distanceM) : null, tour.source === 'manual' ? 'manuell' : null]
      .filter((x): x is string => x !== null)
      .join(' · ');
    const b = h('button', { type: 'button', class: 'tour-item' }, h('span', { class: 'dot', style: `background:${cat?.color ?? '#555555'}` }), h('span', { class: 'tour-text' }, h('strong', {}, tour.name), h('span', { class: 'muted small' }, meta)));
    b.addEventListener('click', () => showEditor(editor(tour)));
    return b;
  }

  async function refresh(): Promise<void> {
    categories = await listCategories(db);
    if (filterId && !categories.some((c) => c.id === filterId)) filterId = '';
    filter.replaceChildren(h('option', { value: '' }, 'Alle Kategorien'), ...categories.map((c) => h('option', { value: c.id }, c.name)));
    filter.value = filterId;
    const tours = await listTours(db, filterId ? { categoryId: filterId } : {});
    list.replaceChildren(...(tours.length > 0 ? tours.map(item) : [h('p', { class: 'muted' }, 'Noch keine Touren. Importiere eine GPX-Datei oder lege oben eine Tour manuell an.')]));
  }

  filter.addEventListener('change', () => {
    filterId = filter.value;
    void refresh();
  });

  newBtn.addEventListener('click', () => showEditor(editor(null)));

  return {
    el,
    async onShow() {
      showList();
      await refresh();
    },
  };
}
