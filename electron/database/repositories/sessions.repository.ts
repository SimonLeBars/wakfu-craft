import Database from 'better-sqlite3';
import { CraftSession, SessionItem, BoughtIngredient, RecipeTreeNode } from '@electron';

interface SessionItemDbRow {
  session_item_id: number;
  craft_quantity: number;
  result_quantity: number;
  item_id: number;
  item_name: string;
  item_level: number;
  rarity: number | null;
  recipe_id: number | null;
  category_id: number | null;
  category_name: string | null;
}
interface SubRecipeRow {
  item_id: number;
  recipe_id: number;
}
interface ShoppingIngRow {
  quantity: number;
  item_id: number;
  item_name: string;
  item_level: number;
  rarity: number | null;
}

const SESSION_ITEM_SELECT = `
  SELECT si.id AS session_item_id, si.quantity AS craft_quantity,
         COALESCE(r.result_quantity, 1) AS result_quantity,
         i.id AS item_id, i.name AS item_name, i.level AS item_level,
         si.recipe_id,
         COALESCE(
           json_extract(i.raw_data, '$.definition.item.baseParameters.rarity'),
           json_extract(i.raw_data, '$.definition.rarity'),
           0
         ) AS rarity,
         r.category_id,
         rc.name AS category_name
  FROM craft_session_items si
  JOIN items i ON i.id = si.item_id
  LEFT JOIN recipes r ON r.id = si.recipe_id
  LEFT JOIN recipe_categories rc ON rc.id = r.category_id
`;

export class SessionsRepository {
  constructor(private db: Database.Database) {}

  createSession(name: string): number {
    const result = this.db.prepare('INSERT INTO craft_sessions (name) VALUES (?)').run(name);
    return result.lastInsertRowid as number;
  }

  getSessions(): CraftSession[] {
    return this.db
      .prepare(
        `
      SELECT s.id, s.name, s.created_at, s.step, COUNT(si.id) as item_count
      FROM craft_sessions s
      LEFT JOIN craft_session_items si ON si.session_id = s.id
      GROUP BY s.id ORDER BY s.created_at DESC
    `,
      )
      .all() as CraftSession[];
  }

  renameSession(id: number, name: string): void {
    this.db.prepare('UPDATE craft_sessions SET name = ? WHERE id = ?').run(name, id);
  }

  deleteSession(sessionId: number): void {
    this.db.prepare('DELETE FROM craft_sessions WHERE id = ?').run(sessionId);
  }

  addItemToSession(
    sessionId: number,
    itemId: number,
    quantity: number,
    recipeId: number | null,
    subRecipes: Record<number, number>,
  ): number {
    const result = this.db
      .prepare(
        'INSERT INTO craft_session_items (session_id, item_id, quantity, recipe_id) VALUES (?, ?, ?, ?)',
      )
      .run(sessionId, itemId, quantity, recipeId);
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
    this.db
      .prepare('UPDATE craft_session_items SET quantity = ? WHERE id = ?')
      .run(quantity, sessionItemId);
  }

  getSessionItems(sessionId: number): SessionItem[] {
    const rows = this.db
      .prepare(`${SESSION_ITEM_SELECT} WHERE si.session_id = ? ORDER BY i.level ASC`)
      .all(sessionId) as SessionItemDbRow[];
    return rows.map((row) => ({
      session_item_id: row.session_item_id,
      craft_quantity: row.craft_quantity,
      result_quantity: row.result_quantity ?? 1,
      item_id: row.item_id,
      item_name: JSON.parse(row.item_name) as Record<string, string>,
      item_level: row.item_level,
      rarity: row.rarity ?? 0,
      recipe_id: row.recipe_id ?? null,
    }));
  }

  getSessionTree(sessionId: number): RecipeTreeNode[] {
    const rootRows = this.db
      .prepare(`${SESSION_ITEM_SELECT} WHERE si.session_id = ? ORDER BY i.level ASC`)
      .all(sessionId) as SessionItemDbRow[];

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
    const recipeCategoryStmt = this.db.prepare(`
      SELECT r.category_id, rc.name AS category_name
      FROM recipes r
      LEFT JOIN recipe_categories rc ON rc.id = r.category_id
      WHERE r.id = ?
    `);

    const buildTreeNode = (
      sessionItemId: number,
      itemId: number,
      craftQty: number,
      resultQty: number,
      recipeId: number | null,
      subRecipes: Record<number, number>,
      itemData: { item_name: string; item_level: number; rarity: number | null },
      categoryId: number | null,
      categoryName: string | null,
    ): RecipeTreeNode => {
      const boughtIngredients: BoughtIngredient[] = [];
      const children: RecipeTreeNode[] = [];

      if (recipeId) {
        for (const ing of ingStmt.all(recipeId) as ShoppingIngRow[]) {
          if (ing.item_id in subRecipes) {
            const childRecipeId = subRecipes[ing.item_id];
            const childQty = ing.quantity * craftQty;
            const childResult = recipeResultStmt.get(childRecipeId) as
              | { result_quantity: number }
              | undefined;
            const childCat = recipeCategoryStmt.get(childRecipeId) as
              | { category_id: number | null; category_name: string | null }
              | undefined;
            children.push(
              buildTreeNode(
                0,
                ing.item_id,
                childQty,
                childResult?.result_quantity ?? 1,
                childRecipeId,
                subRecipes,
                { item_name: ing.item_name, item_level: ing.item_level, rarity: ing.rarity },
                childCat?.category_id ?? null,
                childCat?.category_name ?? null,
              ),
            );
          } else {
            boughtIngredients.push({
              item_id: ing.item_id,
              item_name: JSON.parse(ing.item_name) as Record<string, string>,
              item_level: ing.item_level,
              rarity: ing.rarity ?? 0,
              quantity: ing.quantity * craftQty,
            });
          }
        }
      }

      return {
        session_item_id: sessionItemId,
        item_id: itemId,
        item_name: JSON.parse(itemData.item_name) as Record<string, string>,
        item_level: itemData.item_level,
        rarity: itemData.rarity ?? 0,
        craft_quantity: craftQty,
        result_quantity: resultQty,
        recipe_id: recipeId,
        category_id: categoryId,
        category_name:
          categoryName != null ? (JSON.parse(categoryName) as Record<string, string>) : null,
        bought_ingredients: boughtIngredients,
        children,
      };
    };

    return rootRows.map((row) => {
      const subRecipes: Record<number, number> = {};
      for (const sr of subRecipesStmt.all(row.session_item_id) as SubRecipeRow[]) {
        subRecipes[sr.item_id] = sr.recipe_id;
      }
      return buildTreeNode(
        row.session_item_id,
        row.item_id,
        row.craft_quantity,
        row.result_quantity ?? 1,
        row.recipe_id,
        subRecipes,
        { item_name: row.item_name, item_level: row.item_level, rarity: row.rarity },
        row.category_id ?? null,
        row.category_name ?? null,
      );
    });
  }
}
