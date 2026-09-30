import { createCategory, deleteCategory, listCategories, updateCategory, type Category, type GpxDb } from '../db-api';
import { confirmDialog } from './confirmDialog';
import { h } from './dom';

const DEFAULT_NEW_COLOR = '#607d8b';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function tourCountText(n: number): string {
  return n === 1 ? '1 Tour' : `${n} Touren`;
}

/**
 * Verwaltung der Kategorien: Name und Farbe werden beim Verlassen des Feldes bzw. Ändern der Farbe automatisch gespeichert.
 * Löschen ist mit Zielkategorie möglich, falls Touren zugeordnet sind.
 */
export function createCategoriesPanel(db: GpxDb): { el: HTMLElement; refresh(): Promise<void> } {
  const el = h('div', { class: 'categories' });

  function row(cat: Category, all: Category[], tourCount: number): HTMLElement {
    let saved = { name: cat.name, color: cat.color };
    const name = h('input', { type: 'text', value: cat.name, 'aria-label': 'Kategoriename', autocomplete: 'off' });
    const color = h('input', { type: 'color', value: cat.color, 'aria-label': `Farbe für ${cat.name}`, class: 'swatch' });
    const del = h('button', { type: 'button', class: 'danger ghost' }, 'Löschen');
    const msg = h('div', { class: 'row-msg', role: 'status' });
    const prompt = h('div', { class: 'delete-prompt', hidden: '' });

    async function autosave(): Promise<void> {
      if (name.value === saved.name && color.value === saved.color) return;
      try {
        const updated = await updateCategory(db, cat.id, { name: name.value, color: color.value });
        saved = { name: updated.name, color: updated.color };
        name.value = updated.name;
        msg.textContent = 'Gespeichert ✓';
        msg.classList.remove('error');
      } catch (e) {
        msg.textContent = errorText(e);
        msg.classList.add('error');
      }
    }
    name.addEventListener('change', () => void autosave());
    color.addEventListener('change', () => void autosave());

    del.addEventListener('click', async () => {
      msg.textContent = '';
      prompt.replaceChildren();
      try {
        const used = await db.tours.where('categoryId').equals(cat.id).count();
        const others = all.filter((c) => c.id !== cat.id);
        if (used === 0) {
          if (!(await confirmDialog({ title: 'Kategorie löschen?', text: `Die Kategorie "${cat.name}" wird gelöscht. Es sind keine Touren zugeordnet.`, confirmLabel: 'Löschen', destructive: true }))) return;
          await deleteCategory(db, cat.id);
          await refresh();
          return;
        }
        if (others.length === 0) {
          msg.textContent = `${tourCountText(used)} nutzen diese Kategorie. Lege zuerst eine weitere Kategorie an, in die sie verschoben werden können.`;
          msg.classList.add('error');
          return;
        }
        const target = h('select', { 'aria-label': 'Zielkategorie' }, ...others.map((c) => h('option', { value: c.id }, c.name)));
        const confirmBtn = h('button', { type: 'button', class: 'danger' }, 'Verschieben und löschen');
        const cancelBtn = h('button', { type: 'button' }, 'Abbrechen');
        cancelBtn.addEventListener('click', () => {
          prompt.hidden = true;
          prompt.replaceChildren();
        });
        confirmBtn.addEventListener('click', async () => {
          try {
            await deleteCategory(db, cat.id, target.value);
            await refresh();
          } catch (e) {
            msg.textContent = errorText(e);
            msg.classList.add('error');
          }
        });
        prompt.append(
          h('div', {}, `${tourCountText(used)} in „${cat.name}“ werden verschoben nach:`),
          target,
          h('div', { class: 'row' }, confirmBtn, cancelBtn),
        );
        prompt.hidden = false;
      } catch (e) {
        msg.textContent = errorText(e);
        msg.classList.add('error');
      }
    });

    return h(
      'div',
      { class: 'cat-item' },
      h('div', { class: 'cat-row' }, color, h('div', { class: 'cat-main' }, name, h('div', { class: 'muted small' }, tourCountText(tourCount))), del),
      msg,
      prompt,
    );
  }

  function addForm(): HTMLElement {
    const name = h('input', { type: 'text', placeholder: 'Neue Kategorie', 'aria-label': 'Name der neuen Kategorie', autocomplete: 'off' });
    const color = h('input', { type: 'color', value: DEFAULT_NEW_COLOR, 'aria-label': 'Farbe der neuen Kategorie', class: 'swatch' });
    const add = h('button', { type: 'button', class: 'primary' }, 'Hinzufügen');
    const msg = h('div', { class: 'row-msg error', role: 'status' });
    async function create(): Promise<void> {
      try {
        await createCategory(db, { name: name.value, color: color.value });
        await refresh();
      } catch (e) {
        msg.textContent = errorText(e);
      }
    }
    add.addEventListener('click', () => void create());
    name.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') void create();
    });
    return h('div', { class: 'cat-add' }, h('div', { class: 'cat-row' }, color, h('div', { class: 'cat-main' }, name), add), msg);
  }

  async function refresh(): Promise<void> {
    const all = await listCategories(db);
    const counts = await Promise.all(all.map((c) => db.tours.where('categoryId').equals(c.id).count()));
    el.replaceChildren(
      ...(all.length > 0 ? all.map((c, i) => row(c, all, counts[i] ?? 0)) : [h('p', { class: 'muted' }, 'Noch keine Kategorien. Lege unten die erste an.')]),
      addForm(),
    );
  }

  return { el, refresh };
}
