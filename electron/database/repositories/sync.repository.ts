import Database from 'better-sqlite3';

interface RawWakfuItem {
  definition?: {
    item?: {
      id?: number;
      level?: number;
      baseParameters?: { itemTypeId?: number; rarity?: number };
    };
  };
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
  recipeId: number;
  productedItemId: number;
  productedItemQuantity: number;
}

interface RawWakfuRecipeCategory {
  definition?: { id?: number; isInnate?: boolean };
  title?: Record<string, string>;
}

export class SyncRepository {
  constructor(private db: Database.Database) {}

  importData(file: string, data: unknown[]): number {
    this.db.pragma('foreign_keys = OFF');
    try {
      if (file === 'items') return this.importItems(data as RawWakfuItem[]);
      if (file === 'jobsItems') return this.importJobsItems(data as RawWakfuJobItem[]);
      if (file === 'recipes') return this.importRecipes(data as RawWakfuRecipe[]);
      if (file === 'recipeIngredients')
        return this.importRecipeIngredients(data as RawWakfuIngredient[]);
      if (file === 'recipeResults') return this.importRecipeResults(data as RawWakfuRecipeResult[]);
      if (file === 'itemTypes') return this.importItemTypes(data as RawWakfuItemType[]);
      if (file === 'recipeCategories')
        return this.importRecipeCategories(data as RawWakfuRecipeCategory[]);
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
          id: def?.id,
          name: JSON.stringify(item.title),
          type:
            def?.baseParameters?.itemTypeId != null
              ? Math.trunc(def.baseParameters.itemTypeId)
              : null,
          level: def?.level,
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
          id: def?.id,
          name: JSON.stringify(item.title),
          type: def?.itemTypeId != null ? Math.trunc(def.itemTypeId) : null,
          level: def?.level,
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
          id: recipe.id,
          result_item_id: null,
          category_id: recipe.categoryId,
          level: recipe.level,
          xp_ratio: recipe.xpRatio,
          raw_data: JSON.stringify(recipe),
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
        update.run({
          recipe_id: result.recipeId,
          item_id: result.productedItemId,
          result_quantity: result.productedItemQuantity ?? 1,
        });
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
          Object.entries(t.title ?? {}).map(([lang, val]) => [
            lang,
            val.replace(/\{[^}]+\}/g, '').trim(),
          ]),
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
        insert.run({
          id,
          name: JSON.stringify(cat.title ?? {}),
          is_innate: cat.definition?.isInnate ? 1 : 0,
        });
      }
    });
    insertMany(data);
    return data.length;
  }
}
