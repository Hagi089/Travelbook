import type { GpxDb } from './db';
import { newId } from './db';
import type { Category } from './types';

const SEEDED_KEY = 'defaultCategoriesSeeded';

export const DEFAULT_CATEGORIES: ReadonlyArray<Pick<Category, 'id' | 'name' | 'color'>> = [
  { id: 'default-urlaub', name: 'Urlaub', color: '#e53935' },
  { id: 'default-fahrradfahren', name: 'Fahrradfahren', color: '#1e88e5' },
  { id: 'default-wandern', name: 'Wandern', color: '#43a047' },
  { id: 'default-tauchen', name: 'Tauchen', color: '#00acc1' },
  { id: 'default-womo-stellplatz', name: 'Womo-Stellplatz', color: '#fb8c00' },
  { id: 'default-unterkunft', name: 'Unterkunft', color: '#8e24aa' },
];

/** Legt die Standardkategorien genau einmal an. Vom Nutzer gelöschte Standardkategorien kommen nicht zurück. */
export async function seedDefaultCategories(db: GpxDb): Promise<void> {
  await db.transaction('rw', db.categories, db.meta, async () => {
    if (await db.meta.get(SEEDED_KEY)) return;
    const now = Date.now();
    await db.categories.bulkAdd(
      DEFAULT_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i, isDefault: true, createdAt: now, updatedAt: now })),
    );
    await db.meta.put({ key: SEEDED_KEY, value: true });
  });
}

export async function listCategories(db: GpxDb): Promise<Category[]> {
  return db.categories.orderBy('sortOrder').toArray();
}

function cleanName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error('Kategoriename darf nicht leer sein.');
  return n;
}

async function assertNameFree(db: GpxDb, name: string, exceptId?: string): Promise<void> {
  const lower = name.toLocaleLowerCase();
  const all = await db.categories.toArray();
  if (all.some((c) => c.id !== exceptId && c.name.toLocaleLowerCase() === lower)) {
    throw new Error(`Kategorie "${name}" existiert bereits.`);
  }
}

export async function createCategory(db: GpxDb, input: { name: string; color: string }): Promise<Category> {
  const name = cleanName(input.name);
  return db.transaction('rw', db.categories, async () => {
    await assertNameFree(db, name);
    const last = await db.categories.orderBy('sortOrder').last();
    const now = Date.now();
    const cat: Category = {
      id: newId(),
      name,
      color: input.color,
      sortOrder: last ? last.sortOrder + 1 : 0,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.categories.add(cat);
    return cat;
  });
}

export async function updateCategory(
  db: GpxDb,
  id: string,
  patch: Partial<Pick<Category, 'name' | 'color' | 'sortOrder'>>,
): Promise<Category> {
  return db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.get(id);
    if (!existing) throw new Error('Kategorie nicht gefunden.');
    const next: Category = { ...existing, ...patch, updatedAt: Date.now() };
    if (patch.name !== undefined) {
      next.name = cleanName(patch.name);
      await assertNameFree(db, next.name, id);
    }
    await db.categories.put(next);
    return next;
  });
}

/**
 * Löscht eine Kategorie. Sind ihr noch Touren zugeordnet, ist `reassignToId` Pflicht,
 * damit keine Tour ohne gültige Kategorie zurückbleibt.
 */
export async function deleteCategory(db: GpxDb, id: string, reassignToId?: string): Promise<void> {
  await db.transaction('rw', db.categories, db.tours, async () => {
    if (!(await db.categories.get(id))) throw new Error('Kategorie nicht gefunden.');
    const affected = await db.tours.where('categoryId').equals(id).primaryKeys();
    if (affected.length > 0) {
      if (!reassignToId || reassignToId === id) {
        throw new Error(`Kategorie wird von ${affected.length} Tour(en) verwendet; Zielkategorie angeben.`);
      }
      if (!(await db.categories.get(reassignToId))) throw new Error('Zielkategorie nicht gefunden.');
      const now = Date.now();
      await db.tours.where('categoryId').equals(id).modify({ categoryId: reassignToId, updatedAt: now });
    }
    await db.categories.delete(id);
  });
}
