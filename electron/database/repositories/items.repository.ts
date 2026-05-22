import Database from 'better-sqlite3';
import { WakfuItem, Recipe, RecipeIngredient } from '@electron';

interface ItemRow {
  id: number;
  name: string;
  type: number;
  level: number;
  rarity: number | null;
}
interface RecipeRow {
  id: number;
  level: number;
  xp_ratio: number;
  category_id: number;
  result_quantity: number;
  category_name: string;
}
interface IngredientRow {
  quantity: number;
  item_id: number;
  item_name: string;
  item_level: number;
  item_type: number;
  rarity: number | null;
}
interface RecipeCategoryRow {
  id: number;
  name: string;
  is_innate: number;
}
interface XpRecipeRow {
  recipe_id: number;
  recipe_level: number;
  xp_ratio: number;
  result_quantity: number;
  category_id: number;
  category_name: string;
  item_id: number;
  item_name: string;
  item_level: number;
  item_type: number;
  rarity: number | null;
}
interface XpIngRow {
  item_id: number;
  quantity: number;
  item_name: string;
  item_level: number;
  item_type: number;
}
interface XpIngredientMapped {
  item_id: number;
  quantity: number;
  item_name: Record<string, string>;
  item_level: number;
  item_type: number;
}
interface XpRecipeMapped {
  recipe_id: number;
  recipe_level: number;
  xp_ratio: number;
  result_quantity: number;
  category_id: number;
  category_name: Record<string, string>;
  item_id: number;
  item_name: Record<string, string>;
  item_level: number;
  item_type: number;
  rarity: number;
  ingredients: XpIngredientMapped[];
}

const RARITY_EXPR = `COALESCE(
  json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
  json_extract(i.raw_data, '$.definition.rarity'),
  0
)`;

export class ItemsRepository {
  private xpRecipeSelect = `
    SELECT r.id AS recipe_id, r.level AS recipe_level, r.xp_ratio, r.result_quantity, r.category_id,
           COALESCE(rc.name, '{}') AS category_name,
           i.id AS item_id, i.name AS item_name, i.level AS item_level, i.type AS item_type,
           ${RARITY_EXPR} AS rarity
    FROM recipes r
    JOIN items i ON r.result_item_id = i.id
    LEFT JOIN recipe_categories rc ON rc.id = r.category_id
  `;

  constructor(private db: Database.Database) {}

  getItemTypes(): { id: number; parent_id: number | null; name: Record<string, string> }[] {
    const rows = this.db
      .prepare('SELECT id, parent_id, name FROM item_types ORDER BY id')
      .all() as { id: number; parent_id: number | null; name: string }[];
    return rows.map((r) => ({ ...r, name: JSON.parse(r.name) as Record<string, string> }));
  }

  getRecipeCategories(): { id: number; name: Record<string, string>; is_innate: boolean }[] {
    const rows = this.db
      .prepare('SELECT id, name, is_innate FROM recipe_categories ORDER BY id')
      .all() as RecipeCategoryRow[];
    return rows.map((r) => ({
      id: r.id,
      name: JSON.parse(r.name) as Record<string, string>,
      is_innate: !!r.is_innate,
    }));
  }

  getRecipesByCategoryAndLevel(categoryId: number, minLevel: number, maxLevel: number) {
    const rows = this.db
      .prepare(
        `${this.xpRecipeSelect} WHERE r.category_id = @categoryId AND recipe_level BETWEEN @minLevel AND @maxLevel ORDER BY r.level ASC`,
      )
      .all({ categoryId, minLevel, maxLevel }) as XpRecipeRow[];
    return this.mapXpRows(rows);
  }

  getRecipesByItemIds(itemIds: number[]) {
    if (itemIds.length === 0) return [];
    const valid = itemIds.filter(Number.isInteger);
    if (valid.length === 0) return [];
    const rows = this.db
      .prepare(
        `${this.xpRecipeSelect} WHERE r.result_item_id IN (${valid.map(() => '?').join(',')})`,
      )
      .all(...valid) as XpRecipeRow[];
    return this.mapXpRows(rows);
  }

  searchItems(
    query: string,
    lang: string = 'fr',
    typeIds: number[] = [],
    minLevel?: number,
    maxLevel?: number,
    rarities: number[] = [],
  ): WakfuItem[] {
    const rarityExprWhere = `COALESCE(json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'), json_extract(i.raw_data, '$.definition.rarity'), 0)`;
    const validTypeIds = typeIds.filter(Number.isInteger);
    const validRarities = rarities.filter(Number.isInteger);
    const typeFilter = validTypeIds.length > 0 ? `AND i.type IN (${validTypeIds.join(',')})` : '';
    const rarityFilter =
      validRarities.length > 0 ? `AND ${rarityExprWhere} IN (${validRarities.join(',')})` : '';
    const levelFilter = [
      minLevel != null ? `AND i.level >= ${Math.trunc(minLevel)}` : '',
      maxLevel != null ? `AND i.level <= ${Math.trunc(maxLevel)}` : '',
    ].join(' ');
    const filters = `${typeFilter} ${levelFilter} ${rarityFilter}`;

    const likeRows = this.db
      .prepare(
        `
      SELECT i.id, i.name, i.type, i.level, ${RARITY_EXPR} AS rarity
      FROM items i
      WHERE json_extract(i.name, '$.${lang}') LIKE @query ${filters}
      ORDER BY i.level ASC
      LIMIT 50
    `,
      )
      .all({ query: `%${query}%` }) as ItemRow[];

    let fuzzyRows: ItemRow[] = [];
    if (likeRows.length < 50) {
      const likeIds = new Set(likeRows.map((r) => r.id));
      fuzzyRows = (
        this.db
          .prepare(
            `
        SELECT i.id, i.name, i.type, i.level, ${RARITY_EXPR} AS rarity
        FROM items i
        WHERE fuzzy_match(i.name, @query, @lang) = 1 ${filters}
        ORDER BY i.level ASC
        LIMIT 50
      `,
          )
          .all({ query, lang }) as ItemRow[]
      ).filter((r) => !likeIds.has(r.id));
    }

    const hasRecipeStmt = this.db.prepare('SELECT 1 FROM recipes WHERE result_item_id = ? LIMIT 1');
    return [...likeRows, ...fuzzyRows].slice(0, 50).map((row) => ({
      ...row,
      name: JSON.parse(row.name) as Record<string, string>,
      rarity: row.rarity ?? 0,
      hasRecipe: !!hasRecipeStmt.get(row.id),
    }));
  }

  getRecipesByItemId(itemId: number): Recipe[] {
    const recipes = this.db
      .prepare(
        `
      SELECT r.id, r.level, r.xp_ratio, r.category_id, r.result_quantity,
             COALESCE(rc.name, '{}') AS category_name
      FROM recipes r
      LEFT JOIN recipe_categories rc ON rc.id = r.category_id
      WHERE r.result_item_id = @itemId
    `,
      )
      .all({ itemId }) as RecipeRow[];

    const ingStmt = this.db.prepare(`
      SELECT ri.quantity, i.id AS item_id, i.name AS item_name,
             i.level AS item_level, i.type AS item_type,
             ${RARITY_EXPR} AS rarity
      FROM recipe_ingredients ri
      JOIN items i ON i.id = ri.item_id
      WHERE ri.recipe_id = @recipeId
    `);
    const hasRecipeStmt = this.db.prepare('SELECT 1 FROM recipes WHERE result_item_id = ? LIMIT 1');

    return recipes.map((recipe) => ({
      ...recipe,
      category_name: JSON.parse(recipe.category_name) as Record<string, string>,
      ingredients: (ingStmt.all({ recipeId: recipe.id }) as IngredientRow[]).map(
        (ing): RecipeIngredient => ({
          ...ing,
          item_name: JSON.parse(ing.item_name) as Record<string, string>,
          rarity: ing.rarity ?? 0,
          hasRecipe: !!hasRecipeStmt.get(ing.item_id),
        }),
      ),
    }));
  }

  private mapXpRows(rows: XpRecipeRow[]): XpRecipeMapped[] {
    const ingStmt = this.db.prepare(`
      SELECT ri.item_id, ri.quantity, i.name AS item_name, i.level AS item_level, i.type AS item_type
      FROM recipe_ingredients ri
      JOIN items i ON i.id = ri.item_id
      WHERE ri.recipe_id = @recipeId
    `);
    return rows.map((row) => ({
      recipe_id: row.recipe_id,
      recipe_level: row.recipe_level,
      xp_ratio: row.xp_ratio,
      result_quantity: row.result_quantity,
      category_id: row.category_id,
      category_name: JSON.parse(row.category_name) as Record<string, string>,
      item_id: row.item_id,
      item_name: JSON.parse(row.item_name) as Record<string, string>,
      item_level: row.item_level,
      item_type: row.item_type,
      rarity: row.rarity ?? 0,
      ingredients: (ingStmt.all({ recipeId: row.recipe_id }) as XpIngRow[]).map((ing) => ({
        item_id: ing.item_id,
        quantity: ing.quantity,
        item_name: JSON.parse(ing.item_name) as Record<string, string>,
        item_level: ing.item_level,
        item_type: ing.item_type,
      })),
    }));
  }
}
