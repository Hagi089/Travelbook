import { addPhoto, deletePhoto, listPhotos, MAX_PHOTOS_PER_TOUR, type GpxDb, type Photo } from '../db-api';
import { preparePhoto, type PreparedPhoto } from '../photos/resize';
import { h } from './dom';

/**
 * Fotobereich einer Tour: bis zu 3 Fotos, hinzufügen (Kamera/Galerie über die Systemauswahl) und entfernen.
 * Fotos werden vor dem Speichern verkleinert und komprimiert (siehe preparePhoto).
 */
export function createPhotosSection(db: GpxDb, tourId: string): HTMLElement {
  const root = h('div', { class: 'photos' });
  const msg = h('div', { class: 'status error', role: 'status' });
  const grid = h('div', { class: 'photo-grid' });
  const input = h('input', { type: 'file', accept: 'image/*', hidden: '' });
  let urls: string[] = [];
  let busy = false;

  function revokeUrls(): void {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  }

  function openViewer(url: string): void {
    const close = h('button', { type: 'button', class: 'photo-viewer-close', 'aria-label': 'Schließen' }, '×');
    const viewer = h('div', { class: 'photo-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Foto' }, h('img', { src: url, alt: 'Foto der Tour' }), close);
    const shut = (): void => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', shut);
      viewer.remove();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') shut();
    };
    viewer.addEventListener('click', shut);
    document.addEventListener('keydown', onKey);
    // Android-Zurück-Taste verlässt die Detailansicht; das Vollbild darf dann nicht über der nächsten Seite stehen bleiben.
    window.addEventListener('popstate', shut);
    document.body.append(viewer);
    close.focus();
  }

  function thumb(photo: Photo): HTMLElement {
    const url = URL.createObjectURL(photo.data);
    urls.push(url);
    const img = h('img', { src: url, alt: 'Foto der Tour', class: 'photo-img' });
    const open = h('button', { type: 'button', class: 'photo-open', 'aria-label': 'Foto vergrößern' }, img);
    open.addEventListener('click', () => openViewer(url));
    const remove = h('button', { type: 'button', class: 'photo-remove', 'aria-label': 'Foto entfernen' }, '×');
    remove.addEventListener('click', async () => {
      if (busy || !window.confirm('Foto entfernen?')) return;
      busy = true;
      try {
        await deletePhoto(db, photo.id);
        await render();
      } catch (e) {
        msg.textContent = e instanceof Error ? e.message : String(e);
      } finally {
        busy = false;
      }
    });
    return h('div', { class: 'photo-cell' }, open, remove);
  }

  async function render(): Promise<void> {
    const photos = await listPhotos(db, tourId);
    revokeUrls();
    grid.replaceChildren(...photos.map(thumb));
    if (photos.length < MAX_PHOTOS_PER_TOUR) {
      const add = h('button', { type: 'button', class: 'photo-add', 'aria-label': 'Foto hinzufügen' }, '+ Foto');
      add.addEventListener('click', () => {
        if (!busy) input.click();
      });
      grid.append(add);
    }
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy) return;
    busy = true;
    msg.textContent = '';
    try {
      await addPhoto(db, tourId, await preparePhoto(file));
      await render();
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  });

  root.append(h('h4', {}, `Fotos (max. ${MAX_PHOTOS_PER_TOUR})`), grid, input, msg);
  render().catch((e) => {
    msg.textContent = e instanceof Error ? e.message : String(e);
  });
  return root;
}

/**
 * Fotoauswahl VOR dem Speichern einer Tour (Import-Dialog): Die Fotos werden verkleinert und im Speicher gehalten,
 * bis der Aufrufer sie nach dem Speichern der Tour mit `addPhoto` übernimmt.
 */
export function createStagedPhotos(): { el: HTMLElement; photos: () => PreparedPhoto[] } {
  const staged: PreparedPhoto[] = [];
  const msg = h('div', { class: 'status error', role: 'status' });
  const grid = h('div', { class: 'photo-grid' });
  const input = h('input', { type: 'file', accept: 'image/*', hidden: '' });
  let urls: string[] = [];
  let busy = false;

  function render(): void {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
    grid.replaceChildren(
      ...staged.map((p, i) => {
        const url = URL.createObjectURL(p.data);
        urls.push(url);
        const remove = h('button', { type: 'button', class: 'photo-remove', 'aria-label': 'Foto entfernen' }, '×');
        remove.addEventListener('click', () => {
          staged.splice(i, 1);
          render();
        });
        return h('div', { class: 'photo-cell' }, h('img', { src: url, alt: 'Ausgewähltes Foto', class: 'photo-img' }), remove);
      }),
    );
    if (staged.length < MAX_PHOTOS_PER_TOUR) {
      const add = h('button', { type: 'button', class: 'photo-add', 'aria-label': 'Foto hinzufügen' }, '+ Foto');
      add.addEventListener('click', () => {
        if (!busy) input.click();
      });
      grid.append(add);
    }
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy || staged.length >= MAX_PHOTOS_PER_TOUR) return;
    busy = true;
    msg.textContent = '';
    try {
      staged.push(await preparePhoto(file));
      render();
    } catch (e) {
      msg.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  });

  render();
  return { el: h('div', { class: 'photos' }, h('h4', {}, `Fotos (max. ${MAX_PHOTOS_PER_TOUR})`), grid, input, msg), photos: () => [...staged] };
}
