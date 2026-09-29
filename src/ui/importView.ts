import { GpxError, addPhoto, listCategories, prepareImport, saveDraft, type GpxDb, type ImportDraft } from '../db-api';
import { createStagedPhotos } from './photosSection';
import { h, type View } from './dom';
import { formatDistance, formatDuration, formatElevation } from './format';

export function createImportView(db: GpxDb, onSaved: () => void): View {
  const status = h('div', { class: 'status', role: 'status' });
  const list = h('div', { class: 'drafts' });
  const input = h('input', { type: 'file', hidden: '', accept: '.gpx,.xml,application/gpx+xml,text/xml,application/xml,application/octet-stream' });
  const pick = h('button', { type: 'button', class: 'primary' }, 'GPX-Datei auswählen');
  pick.addEventListener('click', () => input.click());
  const el = h(
    'section',
    { class: 'view scroll', hidden: '' },
    h(
      'div',
      { class: 'page' },
      h('p', { class: 'muted' }, 'Wähle eine GPX-Datei. Vor dem Speichern kannst du Name, Kategorie, Datum, Notizen und Fotos prüfen.'),
      pick,
      input,
      status,
      list,
    ),
  );
  let categorySelectOptions: Array<{ id: string; name: string }> = [];

  function draftCard(draft: ImportDraft): HTMLElement {
    const name = h('input', { type: 'text', value: draft.name });
    const category = h('select', {}, ...categorySelectOptions.map((c) => h('option', { value: c.id }, c.name)));
    const date = h('input', { type: 'date', value: draft.date });
    const notes = h('textarea', { rows: '3', placeholder: 'Notizen' });
    const photos = createStagedPhotos();
    const save = h('button', { type: 'button', class: 'primary' }, 'Speichern');
    const msg = h('div', { class: 'status' });
    const s = draft.stats;
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const tour = await saveDraft(db, draft, { categoryId: category.value, name: name.value, notes: notes.value, date: date.value || draft.date });
        let photoError = '';
        try {
          for (const p of photos.photos()) await addPhoto(db, tour.id, p);
        } catch (e) {
          photoError = ` Fotos konnten nicht alle gespeichert werden (${e instanceof Error ? e.message : String(e)}); bitte in den Tour-Details ergänzen.`;
        }
        msg.textContent = `Gespeichert ✓${photoError}`;
        onSaved();
      } catch (e) {
        save.disabled = false;
        msg.textContent = `Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
      }
    });
    return h(
      'div',
      { class: 'card' },
      h('div', { class: 'muted' }, `${draft.points.length} Punkte · ${formatDistance(s.distanceM)} · ↑ ${formatElevation(s.ascentM)} · ↓ ${formatElevation(s.descentM)} · ${formatDuration(s.durationSec)}${draft.waypoints.length ? ` · ${draft.waypoints.length} Wegpunkte` : ''}`),
      draft.hasTime ? null : h('div', { class: 'notice notice-warn' }, 'Die Datei enthält keine Zeitstempel. Datum bitte prüfen; Dauer und Geschwindigkeit fehlen.'),
      s.skippedJumps > 0 ? h('div', { class: 'muted' }, `${s.skippedJumps} GPS-Sprung/Sprünge werden bei den Berechnungen ignoriert (Rohdaten bleiben erhalten).`) : null,
      h('label', {}, 'Name', name),
      h('label', {}, 'Kategorie', category),
      h('label', {}, 'Datum', date),
      h('label', {}, 'Notizen', notes),
      photos.el,
      save,
      msg,
    );
  }

  input.addEventListener('change', async () => {
    list.replaceChildren();
    status.textContent = '';
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { drafts, warnings } = prepareImport(await file.text(), file.name);
      categorySelectOptions = await listCategories(db);
      status.textContent = [`${drafts.length} Tour(en) gefunden.`, ...warnings].join(' ');
      for (const d of drafts) list.append(draftCard(d));
    } catch (e) {
      status.textContent = e instanceof GpxError ? `Import nicht möglich: ${e.message}` : `Fehler beim Lesen der Datei: ${e instanceof Error ? e.message : String(e)}`;
    }
    input.value = '';
  });

  return { el, onShow() {} };
}
