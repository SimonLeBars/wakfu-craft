import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import { WakfuItem, Recipe, RecipeIngredient, PriceEntry, CraftSession, SessionItem, BoughtIngredient, RecipeTreeNode } from '../../src/electron';
import { MIGRATIONS } from './migrations';
import { fuzzyMatch } from '../shared/fuzzy-match';

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

interface RawWakfuItemType {
  definition?: { id?: number; parentId?: number };
  title?: Record<string, string>;
}

interface RawWakfuRecipeResult {
  recipeId:              number;
  productedItemId:       number;
  productedItemQuantity: number;
}

interface RawWakfuRecipeCategory {
  definition?: { id?: number; isInnate?: boolean };
  title?: Record<string, string>;
}

// ── Types internes pour les lignes SQL ───────────────────────────────────────

interface SettingRow        { value: string }
interface ItemRow           { id: number; name: string; type: number; level: number; rarity: number | null }
interface RecipeRow         { id: number; level: number; xp_ratio: number; category_id: number; result_quantity: number; category_name: string }
interface IngredientRow     { quantity: number; item_id: number; item_name: string; item_level: number; item_type: number; rarity: number | null }
interface PriceRow          { price: number }
interface PriceItemRow      { item_id: number; price: number }
interface PriceEntryRow     { id: number; item_id: number; price: number; recorded_at: string; not_for_sale: number }
interface SessionItemDbRow  { session_item_id: number; craft_quantity: number; result_quantity: number; item_id: number; item_name: string; item_level: number; rarity: number | null; recipe_id: number | null }
interface SubRecipeRow      { item_id: number; recipe_id: number }
interface ShoppingIngRow        { quantity: number; item_id: number; item_name: string; item_level: number; rarity: number | null }
interface RecipeCategoryRow     { id: number; name: string; is_innate: number }
interface XpRecipeRow           { recipe_id: number; recipe_level: number; xp_ratio: number; result_quantity: number; category_id: number; category_name: string; item_id: number; item_name: string; item_level: number; item_type: number; rarity: number | null }
interface XpIngRow              { item_id: number; quantity: number; item_name: string; item_level: number; item_type: number }
interface XpIngredientMapped   { item_id: number; quantity: number; item_name: Record<string, string>; item_level: number; item_type: number }
interface XpRecipeMapped       { recipe_id: number; recipe_level: number; xp_ratio: number; result_quantity: number; category_id: number; category_name: Record<string, string>; item_id: number; item_name: Record<string, string>; item_level: number; item_type: number; rarity: number; ingredients: XpIngredientMapped[] }


export class DatabaseService {
  private db!: Database.Database;

  initialize(): void {
    const dbPath = path.join(app.getPath('userData'), 'wakfu.db');
    console.log(`[DB] Ouverture de la base : ${dbPath}`);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.registerFunctions();
    this.runMigrations();
  }

  private registerFunctions(): void {
    this.db.function('fuzzy_match', (nameJson: string, query: string, lang: string): number => {
      try {
        const name = (JSON.parse(nameJson) as Record<string, string>)[lang] ?? '';
        return fuzzyMatch(name, query) ? 1 : 0;
      } catch {
        return 0;
      }
    });
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

    // FK doit être désactivé HORS transaction pour que SQLite l'applique pendant la migration
    this.db.pragma('foreign_keys = OFF');
    migrate();
    this.db.pragma('foreign_keys = ON');
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

  getProfessionLevels(): Record<number, number> {
    const raw = this.getSetting('profession_levels');
    if (!raw) return {};
    try { return JSON.parse(raw) as Record<number, number>; }
    catch { return {}; }
  }

  setProfessionLevels(levels: Record<number, number>): void {
    this.setSetting('profession_levels', JSON.stringify(levels));
  }

  // #region Imports on Sync
  importData(file: string, data: unknown[]): number {
    this.db.pragma('foreign_keys = OFF');
    try {
      if (file === 'items')             return this.importItems(data as RawWakfuItem[]);
      if (file === 'jobsItems')         return this.importJobsItems(data as RawWakfuJobItem[]);
      if (file === 'recipes')           return this.importRecipes(data as RawWakfuRecipe[]);
      if (file === 'recipeIngredients') return this.importRecipeIngredients(data as RawWakfuIngredient[]);
      if (file === 'recipeResults')     return this.importRecipeResults(data as RawWakfuRecipeResult[]);
      if (file === 'itemTypes')          return this.importItemTypes(data as RawWakfuItemType[]);
      if (file === 'recipeCategories')  return this.importRecipeCategories(data as RawWakfuRecipeCategory[]);
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
          type:     def?.baseParameters?.itemTypeId != null ? Math.trunc(def.baseParameters.itemTypeId) : null,
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
          type:     def?.itemTypeId != null ? Math.trunc(def.itemTypeId) : null,
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
      UPDATE recipes SET result_item_id = @item_id, result_quantity = @result_quantity WHERE id = @recipe_id
    `);
    const updateMany = this.db.transaction((results: RawWakfuRecipeResult[]) => {
      for (const result of results) {
        update.run({ recipe_id: result.recipeId, item_id: result.productedItemId, result_quantity: result.productedItemQuantity ?? 1 });
      }
    });
    updateMany(data);
    return data.length;
  }
  private importItemTypes(data: RawWakfuItemType[]): number {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO item_types (id, parent_id, name) VALUES (@id, @parent_id, @name)
    `);
    const insertMany = this.db.transaction((types: RawWakfuItemType[]) => {
      for (const t of types) {
        const id = t.definition?.id;
        if (!id) continue;
        const name = Object.fromEntries(
          Object.entries(t.title ?? {}).map(([lang, val]) => [lang, val.replace(/\{[^}]+\}/g, '').trim()]),
        );
        insert.run({ id, parent_id: t.definition?.parentId ?? null, name: JSON.stringify(name) });
      }
    });
    insertMany(data);
    return data.length;
  }

  private importRecipeCategories(data: RawWakfuRecipeCategory[]): number {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO recipe_categories (id, name, is_innate) VALUES (@id, @name, @is_innate)
    `);
    const insertMany = this.db.transaction((cats: RawWakfuRecipeCategory[]) => {
      for (const cat of cats) {
        const id = cat.definition?.id;
        if (!id) continue;
        insert.run({ id, name: JSON.stringify(cat.title ?? {}), is_innate: cat.definition?.isInnate ? 1 : 0 });
      }
    });
    insertMany(data);
    return data.length;
  }

  // #endregion

  getItemTypes(): { id: number; parent_id: number | null; name: Record<string, string> }[] {
    const rows = this.db.prepare('SELECT id, parent_id, name FROM item_types ORDER BY id').all() as { id: number; parent_id: number | null; name: string }[];
    return rows.map(r => ({ ...r, name: JSON.parse(r.name) as Record<string, string> }));
  }

  getRecipeCategories(): { id: number; name: Record<string, string>; is_innate: boolean }[] {
    const rows = this.db.prepare('SELECT id, name, is_innate FROM recipe_categories ORDER BY id').all() as RecipeCategoryRow[];
    return rows.map(r => ({ id: r.id, name: JSON.parse(r.name) as Record<string, string>, is_innate: !!r.is_innate }));
  }

  private xpRecipeSelect = `
    SELECT r.id AS recipe_id, r.level AS recipe_level, r.xp_ratio, r.result_quantity, r.category_id,
           COALESCE(rc.name, '{}') AS category_name,
           i.id AS item_id, i.name AS item_name, i.level AS item_level, i.type AS item_type,
           COALESCE(
             json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
             json_extract(i.raw_data, '$.definition.rarity'),
             0
           ) AS rarity
    FROM recipes r
    JOIN items i ON r.result_item_id = i.id
    LEFT JOIN recipe_categories rc ON rc.id = r.category_id
  `;

  private mapXpRows(rows: XpRecipeRow[]): XpRecipeMapped[] {
    const ingStmt = this.db.prepare(`
      SELECT ri.item_id, ri.quantity, i.name AS item_name, i.level AS item_level, i.type AS item_type
      FROM recipe_ingredients ri
      JOIN items i ON i.id = ri.item_id
      WHERE ri.recipe_id = @recipeId
    `);
    return rows.map(row => ({
      recipe_id:       row.recipe_id,
      recipe_level:    row.recipe_level,
      xp_ratio:        row.xp_ratio,
      result_quantity: row.result_quantity,
      category_id:     row.category_id,
      category_name:   JSON.parse(row.category_name) as Record<string, string>,
      item_id:         row.item_id,
      item_name:       JSON.parse(row.item_name) as Record<string, string>,
      item_level:      row.item_level,
      item_type:       row.item_type,
      rarity:          row.rarity ?? 0,
      ingredients:     (ingStmt.all({ recipeId: row.recipe_id }) as XpIngRow[]).map(ing => ({
        item_id:    ing.item_id,
        quantity:   ing.quantity,
        item_name:  JSON.parse(ing.item_name) as Record<string, string>,
        item_level: ing.item_level,
        item_type:  ing.item_type,
      })),
    }));
  }

  getRecipesByCategoryAndLevel(categoryId: number, minLevel: number, maxLevel: number) {
    const rows = this.db.prepare(
      `${this.xpRecipeSelect} WHERE r.category_id = @categoryId and recipe_level between @minLevel and @maxLevel ORDER BY r.level ASC`
    ).all({ categoryId, minLevel, maxLevel }) as XpRecipeRow[];
    return this.mapXpRows(rows);
  }

  getRecipesByItemIds(itemIds: number[]) {
    if (itemIds.length === 0) return [];
    const valid = itemIds.filter(Number.isInteger);
    if (valid.length === 0) return [];
    const rows = this.db.prepare(
      `${this.xpRecipeSelect} WHERE r.result_item_id IN (${valid.map(() => '?').join(',')})`
    ).all(...valid) as XpRecipeRow[];
    return this.mapXpRows(rows);
  }

  searchItems(query: string, lang: string = 'fr', typeIds: number[] = [], minLevel?: number, maxLevel?: number, rarities: number[] = []): WakfuItem[] {
    const rarityExpr = `COALESCE(
      json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
      json_extract(i.raw_data, '$.definition.rarity'),
      0
    ) AS rarity`;
    const rarityExprWhere = `COALESCE(json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'), json_extract(i.raw_data, '$.definition.rarity'), 0)`;
    const validTypeIds    = typeIds.filter(Number.isInteger);
    const validRarities   = rarities.filter(Number.isInteger);
    const typeFilter      = validTypeIds.length  > 0 ? `AND i.type IN (${validTypeIds.join(',')})` : '';
    const rarityFilter    = validRarities.length > 0 ? `AND ${rarityExprWhere} IN (${validRarities.join(',')})` : '';
    const levelFilter     = [
      minLevel != null ? `AND i.level >= ${Math.trunc(minLevel)}` : '',
      maxLevel != null ? `AND i.level <= ${Math.trunc(maxLevel)}` : '',
    ].join(' ');
    const filters = `${typeFilter} ${levelFilter} ${rarityFilter}`;

    const likeRows = this.db.prepare(`
      SELECT i.id, i.name, i.type, i.level, ${rarityExpr}
      FROM items i
      WHERE json_extract(i.name, '$.${lang}') LIKE @query ${filters}
      ORDER BY i.level ASC
      LIMIT 50
    `).all({ query: `%${query}%` }) as ItemRow[];

    let fuzzyRows: ItemRow[] = [];
    if (likeRows.length < 50) {
      const likeIds = new Set(likeRows.map(r => r.id));
      fuzzyRows = (this.db.prepare(`
        SELECT i.id, i.name, i.type, i.level, ${rarityExpr}
        FROM items i
        WHERE fuzzy_match(i.name, @query, @lang) = 1 ${filters}
        ORDER BY i.level ASC
        LIMIT 50
      `).all({ query, lang }) as ItemRow[]).filter(r => !likeIds.has(r.id));
    }

    const hasRecipeStmt = this.db.prepare('SELECT 1 FROM recipes WHERE result_item_id = ? LIMIT 1');
    return [...likeRows, ...fuzzyRows].slice(0, 50).map(row => ({
      ...row,
      name:      JSON.parse(row.name) as Record<string, string>,
      rarity:    row.rarity ?? 0,
      hasRecipe: !!hasRecipeStmt.get(row.id),
    }));
  }

  getRecipesByItemId(itemId: number): Recipe[] {
    const recipes = this.db.prepare(`
      SELECT r.id, r.level, r.xp_ratio, r.category_id, r.result_quantity,
             COALESCE(rc.name, '{}') AS category_name
      FROM recipes r
      LEFT JOIN recipe_categories rc ON rc.id = r.category_id
      WHERE r.result_item_id = @itemId
    `).all({ itemId }) as RecipeRow[];

    const ingStmt = this.db.prepare(`
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
    `);
    const hasRecipeStmt = this.db.prepare('SELECT 1 FROM recipes WHERE result_item_id = ? LIMIT 1');

    return recipes.map(recipe => ({
      ...recipe,
      category_name: JSON.parse(recipe.category_name) as Record<string, string>,
      ingredients:   (ingStmt.all({ recipeId: recipe.id }) as IngredientRow[]).map((ing): RecipeIngredient => ({
        ...ing,
        item_name: JSON.parse(ing.item_name) as Record<string, string>,
        rarity:    ing.rarity ?? 0,
        hasRecipe: !!hasRecipeStmt.get(ing.item_id),
      })),
    }));
  }

  setPrice(itemId: number, price: number): void {
    this.db.prepare(`
      INSERT INTO price_history (item_id, price, not_for_sale) VALUES (@item_id, @price, 0)
    `).run({ item_id: itemId, price });
  }

  setNotForSale(itemId: number): void {
    this.db.prepare(`
      INSERT INTO price_history (item_id, price, not_for_sale) VALUES (@item_id, 0, 1)
    `).run({ item_id: itemId });
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

  getLatestPriceEntries(itemIds: number[]): Record<number, PriceEntry> {
    if (itemIds.length === 0) return {};
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT rowid AS id, item_id, price, recorded_at, not_for_sale FROM price_history p1
      WHERE item_id IN (${placeholders})
      AND recorded_at = (SELECT MAX(recorded_at) FROM price_history p2 WHERE p2.item_id = p1.item_id)
    `).all(...itemIds) as PriceEntryRow[];
    return Object.fromEntries(rows.map(r => [r.item_id, {
      id: r.id, price: r.price, recorded_at: r.recorded_at, not_for_sale: !!r.not_for_sale,
    }]));
  }

  getPriceHistory(itemId: number): PriceEntry[] {
    const rows = this.db.prepare(`
      SELECT rowid AS id, price, recorded_at, not_for_sale FROM price_history
      WHERE item_id = @item_id ORDER BY recorded_at ASC
    `).all({ item_id: itemId }) as PriceEntryRow[];
    return rows.map(r => ({ id: r.id, price: r.price, recorded_at: r.recorded_at, not_for_sale: !!r.not_for_sale }));
  }

  deletePriceEntry(id: number): void {
    this.db.prepare('DELETE FROM price_history WHERE rowid = @id').run({ id });
  }

  renameSession(id: number, name: string): void {
    this.db.prepare('UPDATE craft_sessions SET name = ? WHERE id = ?').run(name, id);
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

  addItemToSession(sessionId: number, itemId: number, quantity: number, recipeId: number | null, subRecipes: Record<number, number>): number {
    const result = this.db.prepare(
      'INSERT INTO craft_session_items (session_id, item_id, quantity, recipe_id) VALUES (?, ?, ?, ?)',
    ).run(sessionId, itemId, quantity, recipeId);
    const sessionItemId = result.lastInsertRowid as number;

    const subStmt = this.db.prepare(
      'INSERT INTO craft_session_sub_recipes (session_item_id, item_id, recipe_id) VALUES (?, ?, ?)',
    );
    const insertSubs = this.db.transaction(() => {
      for (const [subItemId, subRecipeId] of Object.entries(subRecipes)) {
        subStmt.run(sessionItemId, Number(subItemId), subRecipeId);
      }
    });
    insertSubs();

    return sessionItemId;
  }

  removeItemFromSession(sessionItemId: number): void {
    this.db.prepare('DELETE FROM craft_session_items WHERE id = ?').run(sessionItemId);
  }

  updateSessionItemQuantity(sessionItemId: number, quantity: number): void {
    this.db.prepare('UPDATE craft_session_items SET quantity = ? WHERE id = ?').run(quantity, sessionItemId);
  }

  getSessionItems(sessionId: number): SessionItem[] {
    const rows = this.db.prepare(`
      SELECT si.id AS session_item_id, si.quantity AS craft_quantity,
             COALESCE(r.result_quantity, 1) AS result_quantity,
             i.id AS item_id, i.name AS item_name, i.level AS item_level,
             si.recipe_id,
             COALESCE(
               json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
               json_extract(i.raw_data, '$.definition.rarity'),
               0
             ) AS rarity
      FROM craft_session_items si
      JOIN items i ON i.id = si.item_id
      LEFT JOIN recipes r ON r.id = si.recipe_id
      WHERE si.session_id = ?
      ORDER BY i.level ASC
    `).all(sessionId) as SessionItemDbRow[];
    return rows.map(row => ({
      session_item_id: row.session_item_id,
      craft_quantity:  row.craft_quantity,
      result_quantity: row.result_quantity ?? 1,
      item_id:         row.item_id,
      item_name:       JSON.parse(row.item_name) as Record<string, string>,
      item_level:      row.item_level,
      rarity:          row.rarity ?? 0,
      recipe_id:       row.recipe_id ?? null,
    }));
  }

  getSessionTree(sessionId: number): RecipeTreeNode[] {
    const rootRows = this.db.prepare(`
      SELECT si.id AS session_item_id, si.quantity AS craft_quantity,
             COALESCE(r.result_quantity, 1) AS result_quantity,
             i.id AS item_id, i.name AS item_name, i.level AS item_level,
             si.recipe_id,
             COALESCE(
               json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
               json_extract(i.raw_data, '$.definition.rarity'),
               0
             ) AS rarity
      FROM craft_session_items si
      JOIN items i ON i.id = si.item_id
      LEFT JOIN recipes r ON r.id = si.recipe_id
      WHERE si.session_id = ?
      ORDER BY i.level ASC
    `).all(sessionId) as SessionItemDbRow[];

    const subRecipesStmt = this.db.prepare(
      'SELECT item_id, recipe_id FROM craft_session_sub_recipes WHERE session_item_id = ?',
    );
    const ingStmt = this.db.prepare(`
      SELECT ri.quantity, i.id AS item_id, i.name AS item_name, i.level AS item_level,
             COALESCE(
               json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
               json_extract(i.raw_data, '$.definition.rarity'),
               0
             ) AS rarity
      FROM recipe_ingredients ri
      JOIN items i ON i.id = ri.item_id
      WHERE ri.recipe_id = ?
    `);
    const recipeResultStmt = this.db.prepare('SELECT result_quantity FROM recipes WHERE id = ?');

    const buildTreeNode = (
      sessionItemId: number,
      itemId:        number,
      craftQty:      number,
      resultQty:     number,
      recipeId:      number | null,
      subRecipes:    Record<number, number>,
      itemData:      { item_name: string; item_level: number; rarity: number | null },
    ): RecipeTreeNode => {
      const boughtIngredients: BoughtIngredient[] = [];
      const children: RecipeTreeNode[] = [];

      if (recipeId) {
        for (const ing of ingStmt.all(recipeId) as ShoppingIngRow[]) {
          if (ing.item_id in subRecipes) {
            const childRecipeId = subRecipes[ing.item_id];
            const childQty      = ing.quantity * craftQty;
            const childResult   = recipeResultStmt.get(childRecipeId) as { result_quantity: number } | undefined;
            children.push(buildTreeNode(
              0, ing.item_id, childQty, childResult?.result_quantity ?? 1,
              childRecipeId, subRecipes,
              { item_name: ing.item_name, item_level: ing.item_level, rarity: ing.rarity },
            ));
          } else {
            boughtIngredients.push({
              item_id:    ing.item_id,
              item_name:  JSON.parse(ing.item_name) as Record<string, string>,
              item_level: ing.item_level,
              rarity:     ing.rarity ?? 0,
              quantity:   ing.quantity * craftQty,
            });
          }
        }
      }

      return {
        session_item_id:    sessionItemId,
        item_id:            itemId,
        item_name:          JSON.parse(itemData.item_name) as Record<string, string>,
        item_level:         itemData.item_level,
        rarity:             itemData.rarity ?? 0,
        craft_quantity:     craftQty,
        result_quantity:    resultQty,
        recipe_id:          recipeId,
        bought_ingredients: boughtIngredients,
        children,
      };
    };

    return rootRows.map(row => {
      const subRecipes: Record<number, number> = {};
      for (const sr of subRecipesStmt.all(row.session_item_id) as SubRecipeRow[]) {
        subRecipes[sr.item_id] = sr.recipe_id;
      }
      return buildTreeNode(
        row.session_item_id, row.item_id, row.craft_quantity, row.result_quantity ?? 1,
        row.recipe_id, subRecipes,
        { item_name: row.item_name, item_level: row.item_level, rarity: row.rarity },
      );
    });
  }
}
