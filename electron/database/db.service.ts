import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import { WakfuItem, Recipe, RecipeIngredient, PriceEntry, CraftSession, SessionItem, ShoppingItem } from '../../src/electron';
import { MIGRATIONS } from './migrations';

// ── Types internes pour les données brutes de l'API Wakfu CDN ────────────────

interface RawWakfuItem {
  definition?: { item?: { id?: number; level?: number; baseParameters?: { itemTypeId?: number; rarity?: number } } };
  title?: Record<string, string>;
}

interface RawWakfuJobItem {
  definition?: { id?: number; itemTypeId?: number; level?: number };
  title?: Record<string, string>;
}

interface RawWakfuRecipe {
  id: number;
  categoryId?: number;
  level?: number;
  xpRatio?: number;
}

interface RawWakfuIngredient {
  recipeId: number;
  itemId: number;
  quantity: number;
}

interface RawWakfuRecipeResult {
  recipeId: number;
  productedItemId: number;
}

// ── Types internes pour les lignes SQL ───────────────────────────────────────

interface SettingRow        { value: string }
interface ItemRow           { id: number; name: string; type: number; level: number; rarity: number | null }
interface RecipeRow         { id: number; level: number; xp_ratio: number; category_id: number }
interface IngredientRow     { quantity: number; item_id: number; item_name: string; item_level: number; item_type: number; rarity: number | null }
interface PriceRow          { price: number }
interface PriceItemRow      { item_id: number; price: number }
interface RecipeIdRow       { id: number }
interface SessionItemDbRow  { session_item_id: number; craft_quantity: number; item_id: number; item_name: string; item_level: number; rarity: number | null }
interface ExistingItemRow   { id: number; quantity: number }
interface ShoppingIngRow    { quantity: number; item_id: number; item_name: string; item_level: number; rarity: number | null }


export class DatabaseService {
  private db!: Database.Database;

  initialize(): void {
    const dbPath = path.join(app.getPath('userData'), 'wakfu.db');
    console.log(`[DB] Ouverture de la base : ${dbPath}`);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.runMigrations();
  }

  private runMigrations(): void {
    const currentVersion = (this.db.pragma('user_version', { simple: true }) as number) ?? 0;
    const targetVersion = MIGRATIONS.length;

    if (currentVersion >= targetVersion) {
      console.log(`[DB] Schéma à jour (v${currentVersion}).`);
      return;
    }

    console.log(`[DB] Migration v${currentVersion} → v${targetVersion}…`);

    const migrate = this.db.transaction(() => {
      for (let i = currentVersion; i < targetVersion; i++) {
        console.log(`[DB]   Applying migration v${i + 1}`);
        this.db.exec(MIGRATIONS[i]);
      }
      // user_version ne supporte pas les paramètres liés — interpolation sûre car c'est un entier
      this.db.pragma(`user_version = ${targetVersion}`);
    });

    migrate();
    console.log(`[DB] Migration terminée (v${targetVersion}).`);
  }

  getDb(): Database.Database {
    return this.db;
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as SettingRow | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  importData(file: string, data: unknown[]): number {
    this.db.pragma('foreign_keys = OFF');
    try {
      if (file === 'items')             return this.importItems(data as RawWakfuItem[]);
      if (file === 'jobsItems')         return this.importJobsItems(data as RawWakfuJobItem[]);
      if (file === 'recipes')           return this.importRecipes(data as RawWakfuRecipe[]);
      if (file === 'recipeIngredients') return this.importRecipeIngredients(data as RawWakfuIngredient[]);
      if (file === 'recipeResults')     return this.importRecipeResults(data as RawWakfuRecipeResult[]);
      return 0;
    } finally {
      this.db.pragma('foreign_keys = ON');
    }
  }

  private importItems(data: RawWakfuItem[]): number {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO items (id, name, type, level, raw_data)
      VALUES (@id, @name, @type, @level, @raw_data)
    `);
    const insertMany = this.db.transaction((items: RawWakfuItem[]) => {
      for (const item of items) {
        const def = item.definition?.item;
        insert.run({
          id:       def?.id,
          name:     JSON.stringify(item.title),
          type:     def?.baseParameters?.itemTypeId,
          level:    def?.level,
          raw_data: JSON.stringify(item),
        });
      }
    });
    insertMany(data);
    return data.length;
  }

  private importJobsItems(data: RawWakfuJobItem[]): number {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO items (id, name, type, level, raw_data)
      VALUES (@id, @name, @type, @level, @raw_data)
    `);
    const insertMany = this.db.transaction((items: RawWakfuJobItem[]) => {
      for (const item of items) {
        const def = item.definition;
        insert.run({
          id:       def?.id,
          name:     JSON.stringify(item.title),
          type:     def?.itemTypeId,
          level:    def?.level,
          raw_data: JSON.stringify(item),
        });
      }
    });
    insertMany(data);
    return data.length;
  }

  private importRecipes(data: RawWakfuRecipe[]): number {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO recipes (id, result_item_id, category_id, level, xp_ratio, raw_data)
      VALUES (@id, @result_item_id, @category_id, @level, @xp_ratio, @raw_data)
    `);
    const insertMany = this.db.transaction((recipes: RawWakfuRecipe[]) => {
      for (const recipe of recipes) {
        insert.run({
          id:             recipe.id,
          result_item_id: null,
          category_id:    recipe.categoryId,
          level:          recipe.level,
          xp_ratio:       recipe.xpRatio,
          raw_data:       JSON.stringify(recipe),
        });
      }
    });
    insertMany(data);
    return data.length;
  }

  private importRecipeIngredients(data: RawWakfuIngredient[]): number {
    this.db.prepare('DELETE FROM recipe_ingredients').run();
    const insert = this.db.prepare(`
      INSERT INTO recipe_ingredients (recipe_id, item_id, quantity)
      VALUES (@recipe_id, @item_id, @quantity)
    `);
    const insertMany = this.db.transaction((ingredients: RawWakfuIngredient[]) => {
      for (const ing of ingredients) {
        insert.run({ recipe_id: ing.recipeId, item_id: ing.itemId, quantity: ing.quantity });
      }
    });
    insertMany(data);
    return data.length;
  }

  private importRecipeResults(data: RawWakfuRecipeResult[]): number {
    const update = this.db.prepare(`
      UPDATE recipes SET result_item_id = @item_id WHERE id = @recipe_id
    `);
    const updateMany = this.db.transaction((results: RawWakfuRecipeResult[]) => {
      for (const result of results) {
        update.run({ recipe_id: result.recipeId, item_id: result.productedItemId });
      }
    });
    updateMany(data);
    return data.length;
  }

  searchItems(query: string, lang: string = 'fr'): WakfuItem[] {
    const rows = this.db.prepare(`
      SELECT i.id, i.name, i.type, i.level,
             COALESCE(
             json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
             json_extract(i.raw_data, '$.definition.rarity'),
             0
           ) AS rarity
      FROM items i
      WHERE json_extract(i.name, '$.${lang}') LIKE @query
      ORDER BY i.level ASC
      LIMIT 50
    `).all({ query: `%${query}%` }) as ItemRow[];

    return rows.map(row => ({
      ...row,
      name:      JSON.parse(row.name) as Record<string, string>,
      rarity:    row.rarity ?? 0,
      hasRecipe: !!this.db.prepare('SELECT 1 FROM recipes WHERE result_item_id = ?').get(row.id),
    }));
  }

  getRecipeByItemId(itemId: number): Recipe | null {
    const recipe = this.db.prepare(`
      SELECT r.id, r.level, r.xp_ratio, r.category_id
      FROM recipes r WHERE r.result_item_id = @itemId
    `).get({ itemId }) as RecipeRow | undefined;

    if (!recipe) return null;

    const ingredients = this.db.prepare(`
      SELECT ri.quantity, i.id AS item_id, i.name AS item_name,
             i.level AS item_level, i.type AS item_type,
             COALESCE(
               json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
               json_extract(i.raw_data, '$.definition.rarity'),
               0
             ) AS rarity
      FROM recipe_ingredients ri
      JOIN items i ON i.id = ri.item_id
      WHERE ri.recipe_id = @recipeId
    `).all({ recipeId: recipe.id }) as IngredientRow[];

    const hasRecipeStmt = this.db.prepare('SELECT 1 FROM recipes WHERE result_item_id = ? LIMIT 1');

    return {
      ...recipe,
      ingredients: ingredients.map((ing): RecipeIngredient => ({
        ...ing,
        item_name: JSON.parse(ing.item_name) as Record<string, string>,
        rarity:    ing.rarity ?? 0,
        hasRecipe: !!hasRecipeStmt.get(ing.item_id),
      })),
    };
  }

  setPrice(itemId: number, price: number): void {
    this.db.prepare(`
      INSERT INTO price_history (item_id, price) VALUES (@item_id, @price)
    `).run({ item_id: itemId, price });
  }

  getLatestPrice(itemId: number): number | null {
    const row = this.db.prepare(`
      SELECT price FROM price_history WHERE item_id = @item_id ORDER BY recorded_at DESC LIMIT 1
    `).get({ item_id: itemId }) as PriceRow | undefined;
    return row?.price ?? null;
  }

  getLatestPrices(itemIds: number[]): Record<number, number> {
    if (itemIds.length === 0) return {};
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT item_id, price FROM price_history p1
      WHERE item_id IN (${placeholders})
      AND recorded_at = (SELECT MAX(recorded_at) FROM price_history p2 WHERE p2.item_id = p1.item_id)
    `).all(...itemIds) as PriceItemRow[];
    return Object.fromEntries(rows.map(r => [r.item_id, r.price]));
  }

  getPriceHistory(itemId: number): PriceEntry[] {
    return this.db.prepare(`
      SELECT price, recorded_at FROM price_history WHERE item_id = @item_id ORDER BY recorded_at ASC
    `).all({ item_id: itemId }) as PriceEntry[];
  }

  createSession(name: string): number {
    const result = this.db.prepare('INSERT INTO craft_sessions (name) VALUES (?)').run(name);
    return result.lastInsertRowid as number;
  }

  getSessions(): CraftSession[] {
    return this.db.prepare(`
      SELECT s.id, s.name, s.created_at, COUNT(si.id) as item_count
      FROM craft_sessions s
      LEFT JOIN craft_session_items si ON si.session_id = s.id
      GROUP BY s.id ORDER BY s.created_at DESC
    `).all() as CraftSession[];
  }

  deleteSession(sessionId: number): void {
    this.db.prepare('DELETE FROM craft_sessions WHERE id = ?').run(sessionId);
  }

  addItemToSession(sessionId: number, itemId: number, quantity: number): void {
    const existing = this.db.prepare(`
      SELECT id, quantity FROM craft_session_items WHERE session_id = ? AND item_id = ?
    `).get(sessionId, itemId) as ExistingItemRow | undefined;

    if (existing) {
      this.db.prepare('UPDATE craft_session_items SET quantity = ? WHERE id = ?')
        .run(existing.quantity + quantity, existing.id);
    } else {
      this.db.prepare('INSERT INTO craft_session_items (session_id, item_id, quantity) VALUES (?, ?, ?)')
        .run(sessionId, itemId, quantity);
    }
  }

  removeItemFromSession(sessionItemId: number): void {
    this.db.prepare('DELETE FROM craft_session_items WHERE id = ?').run(sessionItemId);
  }

  updateSessionItemQuantity(sessionItemId: number, quantity: number): void {
    this.db.prepare('UPDATE craft_session_items SET quantity = ? WHERE id = ?').run(quantity, sessionItemId);
  }

  getSessionItems(sessionId: number): SessionItem[] {
    return (this.db.prepare(`
      SELECT si.id AS session_item_id, si.quantity AS craft_quantity,
             i.id AS item_id, i.name AS item_name, i.level AS item_level,
             COALESCE(
               json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
               json_extract(i.raw_data, '$.definition.rarity'),
               0
             ) AS rarity
      FROM craft_session_items si
      JOIN items i ON i.id = si.item_id
      WHERE si.session_id = ? ORDER BY i.level ASC
    `).all(sessionId) as SessionItemDbRow[]).map(row => ({
      ...row,
      item_name: JSON.parse(row.item_name) as Record<string, string>,
      rarity:    row.rarity ?? 0,
    }));
  }

  getShoppingList(sessionId: number): ShoppingItem[] {
    const sessionItems = this.getSessionItems(sessionId);
    const aggregated: Record<number, ShoppingItem> = {};

    for (const si of sessionItems) {
      const recipe = this.db.prepare('SELECT id FROM recipes WHERE result_item_id = ?')
        .get(si.item_id) as RecipeIdRow | undefined;
      if (!recipe) continue;

      const ingredients = this.db.prepare(`
        SELECT ri.quantity, i.id AS item_id, i.name AS item_name, i.level AS item_level,
               COALESCE(
                 json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
                 json_extract(i.raw_data, '$.definition.rarity'),
                 0
               ) AS rarity
        FROM recipe_ingredients ri JOIN items i ON i.id = ri.item_id WHERE ri.recipe_id = ?
      `).all(recipe.id) as ShoppingIngRow[];

      for (const ing of ingredients) {
        const totalQty = ing.quantity * si.craft_quantity;
        if (aggregated[ing.item_id]) {
          aggregated[ing.item_id].total_quantity += totalQty;
        } else {
          aggregated[ing.item_id] = {
            item_id:        ing.item_id,
            item_name:      JSON.parse(ing.item_name) as Record<string, string>,
            item_level:     ing.item_level,
            rarity:         ing.rarity ?? 0,
            total_quantity: totalQty,
          };
        }
      }
    }

    return Object.values(aggregated).sort((a, b) => (b.item_level ?? 0) - (a.item_level ?? 0));
  }
}
