import { createCategory, deleteCategory, listCategories, updateCategory, type Category, type GpxDb } from '../db-api';
import { h } from './dom';

const DEFAULT_NEW_COLOR = '#607d8b';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Verwaltung der Kategorien: anlegen, umbenennen, Farbe ändern, löschen (mit Zielkategorie, falls Touren zugeordnet sind). */
export function createCategoriesPanel(db: GpxDb): { el: HTMLElement; refresh(): Promise<void> } {
  const el = h('div', { class: 'categories' });

  function row(cat: Category, all: Category[]): HTMLElement {
    const name = h('input', { type: 'text', value: cat.name, 'aria-label': 'Kategoriename' });
    const color = h('input', { type: 'color', value: cat.color, 'aria-label': 'Farbe' });
    const save = h('button', { type: 'button' }, 'Speichern');
    const del = h('button', { type: 'button', class: 'danger' }, 'Löschen');
    const msg = h('div', { class: 'status', role: 'status' });
    const prompt = h('div', { class: 'delete-prompt', hidden: '' });

    save.addEventListener('click', async () => {
      try {
        await updateCategory(db, cat.id, { name: name.value, color: color.value });
        msg.textContent = 'Gespeichert ✓';
        await refresh();
      } catch (e) {
        msg.textContent = errorText(e);
      }
    });

    del.addEventListener('click', async () => {
      msg.textContent = '';
      prompt.replaceChildren();
      try {
        const used = await db.tours.where('categoryId').equals(cat.id).count();
        const others = all.filter((c) => c.id !== cat.id);
        if (used === 0) {
          if (!window.confirm(`Kategorie "${cat.name}" wirklich löschen?`)) return;
          await deleteCategory(db, cat.id);
          await refresh();
          return;
        }
        if (others.length === 0) {
          msg.textContent = `${used} Tour(en) nutzen diese Kategorie. Lege zuerst eine weitere Kategorie an, in die sie verschoben werden können.`;
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
          }
        });
        prompt.append(
          h('div', {}, `${used} Tour(en) nutzen "${cat.name}". Sie werden in diese Kategorie verschoben:`),
          target,
          h('div', { class: 'row' }, confirmBtn, cancelBtn),
        );
        prompt.hidden = false;
      } catch (e) {
        msg.textContent = errorText(e);
      }
    });

    return h('div', { class: 'card' }, h('div', { class: 'row cat-edit' }, color, name), h('div', { class: 'row' }, save, del), msg, prompt);
  }

  function addForm(): HTMLElement {
    const name = h('input', { type: 'text', placeholder: 'Neue Kategorie', 'aria-label': 'Name der neuen Kategorie' });
    const color = h('input', { type: 'color', value: DEFAULT_NEW_COLOR, 'aria-label': 'Farbe' });
    const add = h('button', { type: 'button' }, 'Hinzufügen');
    const msg = h('div', { class: 'status', role: 'status' });
    add.addEventListener('click', async () => {
      try {
        await createCategory(db, { name: name.value, color: color.value });
        await refresh();
      } catch (e) {
        msg.textContent = errorText(e);
      }
    });
    return h('div', { class: 'card' }, h('div', { class: 'row cat-edit' }, color, name), h('div', { class: 'row' }, add), msg);
  }

  async function refresh(): Promise<void> {
    const all = await listCategories(db);
    el.replaceChildren(...all.map((c) => row(c, all)), addForm());
  }

  return { el, refresh };
}
