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
  recipeId:              number;
  productedItemId:       number;
  productedItemQuantity: number;
}

// ── Types internes pour les lignes SQL ───────────────────────────────────────

interface SettingRow        { value: string }
interface ItemRow           { id: number; name: string; type: number; level: number; rarity: number | null }
interface RecipeRow         { id: number; level: number; xp_ratio: number; category_id: number; result_quantity: number }
interface IngredientRow     { quantity: number; item_id: number; item_name: string; item_level: number; item_type: number; rarity: number | null }
interface PriceRow          { price: number }
interface PriceItemRow      { item_id: number; price: number }
interface PriceEntryRow     { item_id: number; price: number; recorded_at: string }
interface RecipeIdRow       { id: number }
interface SessionItemDbRow  { session_item_id: number; craft_quantity: number; result_quantity: number; item_id: number; item_name: string; item_level: number; rarity: number | null; parent_item_id: number | null }
interface ExistingItemRow   { id: number; quantity: number }
interface IdRow             { id: number }
interface ShoppingIngRow    { quantity: number; item_id: number; item_name: string; item_level: number; rarity: number | null }


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
      let nameStr: string;
      try {
        const nameObj = JSON.parse(nameJson) as Record<string, string>;
        nameStr = this.normalize(nameObj[lang] ?? '');
      } catch {
        return 0;
      }
      const nameWords = nameStr.split(/\s+/).filter(Boolean);
      const queryWords = this.normalize(query).split(/\s+/).filter(Boolean);

      for (const qWord of queryWords) {
        const threshold = qWord.length <= 3 ? 0 : qWord.length <= 6 ? 1 : 2;
        const matched = nameWords.some(
          nWord =>
            Math.abs(nWord.length - qWord.length) <= threshold + 1 &&
            this.levenshtein(qWord, nWord) <= threshold,
        );
        if (!matched) return 0;
      }
      return 1;
    });
  }

  private normalize(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const curr: number[] = [i];
      for (let j = 1; j <= n; j++) {
        curr[j] =
          a[i - 1] === b[j - 1]
            ? prev[j - 1]
            : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      }
      prev = curr;
    }
    return prev[n];
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

  searchItems(query: string, lang: string = 'fr'): WakfuItem[] {
    const rarityExpr = `COALESCE(
      json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
      json_extract(i.raw_data, '$.definition.rarity'),
      0
    ) AS rarity`;

    const likeRows = this.db.prepare(`
      SELECT i.id, i.name, i.type, i.level, ${rarityExpr}
      FROM items i
      WHERE json_extract(i.name, '$.${lang}') LIKE @query
      ORDER BY i.level ASC
      LIMIT 50
    `).all({ query: `%${query}%` }) as ItemRow[];

    let fuzzyRows: ItemRow[] = [];
    if (likeRows.length < 50) {
      const likeIds = new Set(likeRows.map(r => r.id));
      fuzzyRows = (this.db.prepare(`
        SELECT i.id, i.name, i.type, i.level, ${rarityExpr}
        FROM items i
        WHERE fuzzy_match(i.name, @query, @lang) = 1
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

  getRecipeByItemId(itemId: number): Recipe | null {
    const recipe = this.db.prepare(`
      SELECT r.id, r.level, r.xp_ratio, r.category_id, r.result_quantity
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

  getLatestPriceEntries(itemIds: number[]): Record<number, PriceEntry> {
    if (itemIds.length === 0) return {};
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT item_id, price, recorded_at FROM price_history p1
      WHERE item_id IN (${placeholders})
      AND recorded_at = (SELECT MAX(recorded_at) FROM price_history p2 WHERE p2.item_id = p1.item_id)
    `).all(...itemIds) as PriceEntryRow[];
    return Object.fromEntries(rows.map(r => [r.item_id, { price: r.price, recorded_at: r.recorded_at }]));
  }

  getPriceHistory(itemId: number): PriceEntry[] {
    return this.db.prepare(`
      SELECT price, recorded_at FROM price_history WHERE item_id = @item_id ORDER BY recorded_at ASC
    `).all({ item_id: itemId }) as PriceEntry[];
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

  addItemToSession(sessionId: number, itemId: number, quantity: number, parentId: number | null = null): number {
    const existing = this.db.prepare(`
      SELECT id, quantity FROM craft_session_items WHERE session_id = ? AND item_id = ?
    `).get(sessionId, itemId) as ExistingItemRow | undefined;

    if (existing) {
      this.db.prepare('UPDATE craft_session_items SET quantity = ? WHERE id = ?')
        .run(existing.quantity + quantity, existing.id);
      return existing.id;
    } else {
      const result = this.db.prepare(
        'INSERT INTO craft_session_items (session_id, item_id, quantity, parent_item_id) VALUES (?, ?, ?, ?)',
      ).run(sessionId, itemId, quantity, parentId);
      return result.lastInsertRowid as number;
    }
  }

  removeItemFromSession(sessionItemId: number): void {
    // Supprime récursivement les sous-crafts avant l'item parent
    const deleteRecursive = (id: number) => {
      const children = this.db.prepare(
        'SELECT id FROM craft_session_items WHERE parent_item_id = ?',
      ).all(id) as IdRow[];
      for (const child of children) deleteRecursive(child.id);
      this.db.prepare('DELETE FROM craft_session_items WHERE id = ?').run(id);
    };
    deleteRecursive(sessionItemId);
  }

  updateSessionItemQuantity(sessionItemId: number, quantity: number): void {
    const current = this.db.prepare('SELECT quantity FROM craft_session_items WHERE id = ?')
      .get(sessionItemId) as { quantity: number } | undefined;
    if (!current) return;

    const oldQty = current.quantity;
    this.db.prepare('UPDATE craft_session_items SET quantity = ? WHERE id = ?').run(quantity, sessionItemId);

    // Propage le changement proportionnellement aux sous-items
    const updateChildren = (parentId: number) => {
      const children = this.db.prepare(
        'SELECT id, quantity FROM craft_session_items WHERE parent_item_id = ?',
      ).all(parentId) as ExistingItemRow[];
      for (const child of children) {
        const newChildQty = Math.max(1, Math.round((child.quantity * quantity) / oldQty));
        this.db.prepare('UPDATE craft_session_items SET quantity = ? WHERE id = ?').run(newChildQty, child.id);
        updateChildren(child.id);
      }
    };
    updateChildren(sessionItemId);
  }

  // Retourne uniquement les items de premier niveau (pas de parent) — pour la section "Planifiés"
  getSessionItems(sessionId: number): SessionItem[] {
    return this.mapSessionItemRows(
      this.db.prepare(`
        SELECT si.id AS session_item_id, si.quantity AS craft_quantity,
               COALESCE(r.result_quantity, 1) AS result_quantity,
               i.id AS item_id, i.name AS item_name, i.level AS item_level,
               si.parent_item_id,
               COALESCE(
                 json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
                 json_extract(i.raw_data, '$.definition.rarity'),
                 0
               ) AS rarity
        FROM craft_session_items si
        JOIN items i ON i.id = si.item_id
        LEFT JOIN recipes r ON r.result_item_id = si.item_id
        WHERE si.session_id = ? AND si.parent_item_id IS NULL
        ORDER BY i.level ASC
      `).all(sessionId) as SessionItemDbRow[],
    );
  }

  // Retourne TOUS les items de la session, toutes profondeurs confondues
  private getAllSessionItems(sessionId: number): SessionItem[] {
    return this.mapSessionItemRows(
      this.db.prepare(`
        SELECT si.id AS session_item_id, si.quantity AS craft_quantity,
               COALESCE(r.result_quantity, 1) AS result_quantity,
               i.id AS item_id, i.name AS item_name, i.level AS item_level,
               si.parent_item_id,
               COALESCE(
                 json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
                 json_extract(i.raw_data, '$.definition.rarity'),
                 0
               ) AS rarity
        FROM craft_session_items si
        JOIN items i ON i.id = si.item_id
        LEFT JOIN recipes r ON r.result_item_id = si.item_id
        WHERE si.session_id = ?
      `).all(sessionId) as SessionItemDbRow[],
    );
  }

  private mapSessionItemRows(rows: SessionItemDbRow[]): SessionItem[] {
    return rows.map(row => ({
      ...row,
      item_name:       JSON.parse(row.item_name) as Record<string, string>,
      rarity:          row.rarity ?? 0,
      result_quantity: row.result_quantity ?? 1,
      parent_item_id:  row.parent_item_id ?? null,
    }));
  }

  // Retourne les items craft dans l'ordre topologique (sous-items avant leurs parents)
  getCraftOrder(sessionId: number): SessionItem[] {
    const all = this.getAllSessionItems(sessionId);

    const childrenOf = new Map<number | null, SessionItem[]>();
    for (const item of all) {
      const p = item.parent_item_id;
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p)!.push(item);
    }

    const result: SessionItem[] = [];
    const visited = new Set<number>();

    const dfs = (item: SessionItem) => {
      if (visited.has(item.session_item_id)) return;
      visited.add(item.session_item_id);
      for (const child of childrenOf.get(item.session_item_id) ?? []) dfs(child);
      result.push(item);
    };

    for (const root of childrenOf.get(null) ?? []) dfs(root);
    return result;
  }

  getShoppingList(sessionId: number): ShoppingItem[] {
    const allItems = this.getAllSessionItems(sessionId);
    // Tous les items en session sont craftés — leurs item_id sont exclus de la liste de courses
    const craftItemIds = new Set(allItems.map(si => si.item_id));
    const aggregated: Record<number, ShoppingItem> = {};

    const addToList = (itemId: number, itemName: Record<string, string>, itemLevel: number, rarity: number, qty: number) => {
      if (aggregated[itemId]) {
        aggregated[itemId].total_quantity += qty;
      } else {
        aggregated[itemId] = { item_id: itemId, item_name: itemName, item_level: itemLevel, rarity, total_quantity: qty };
      }
    };

    for (const si of allItems) {
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
        if (craftItemIds.has(ing.item_id)) continue;
        addToList(
          ing.item_id,
          JSON.parse(ing.item_name) as Record<string, string>,
          ing.item_level,
          ing.rarity ?? 0,
          ing.quantity * si.craft_quantity,
        );
      }
    }

    return Object.values(aggregated).sort((a, b) => (b.item_level ?? 0) - (a.item_level ?? 0));
  }
}
