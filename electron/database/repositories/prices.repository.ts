import Database from 'better-sqlite3';
import { PriceEntry } from '../../../src/electron';

interface PriceRow {
  price: number;
}
interface PriceItemRow {
  item_id: number;
  price: number;
}
interface PriceEntryRow {
  id: number;
  item_id: number;
  price: number;
  recorded_at: string;
  not_for_sale: number;
}

export class PricesRepository {
  constructor(private db: Database.Database) {}

  setPrice(itemId: number, price: number): void {
    this.db
      .prepare(`INSERT INTO price_history (item_id, price, not_for_sale) VALUES (@item_id, @price, 0)`)
      .run({ item_id: itemId, price });
  }

  setNotForSale(itemId: number): void {
    this.db
      .prepare(`INSERT INTO price_history (item_id, price, not_for_sale) VALUES (@item_id, 0, 1)`)
      .run({ item_id: itemId });
  }

  getLatestPrice(itemId: number): number | null {
    const row = this.db
      .prepare(
        `SELECT price FROM price_history WHERE item_id = @item_id ORDER BY recorded_at DESC LIMIT 1`,
      )
      .get({ item_id: itemId }) as PriceRow | undefined;
    return row?.price ?? null;
  }

  getLatestPrices(itemIds: number[]): Record<number, number> {
    if (itemIds.length === 0) return {};
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `
      SELECT item_id, price FROM price_history p1
      WHERE item_id IN (${placeholders})
      AND recorded_at = (SELECT MAX(recorded_at) FROM price_history p2 WHERE p2.item_id = p1.item_id)
    `,
      )
      .all(...itemIds) as PriceItemRow[];
    return Object.fromEntries(rows.map((r) => [r.item_id, r.price]));
  }

  getLatestPriceEntries(itemIds: number[]): Record<number, PriceEntry> {
    if (itemIds.length === 0) return {};
    const placeholders = itemIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `
      SELECT rowid AS id, item_id, price, recorded_at, not_for_sale FROM price_history p1
      WHERE item_id IN (${placeholders})
      AND recorded_at = (SELECT MAX(recorded_at) FROM price_history p2 WHERE p2.item_id = p1.item_id)
    `,
      )
      .all(...itemIds) as PriceEntryRow[];
    return Object.fromEntries(
      rows.map((r) => [
        r.item_id,
        {
          id: r.id,
          price: r.price,
          recorded_at: r.recorded_at,
          not_for_sale: !!r.not_for_sale,
        },
      ]),
    );
  }

  getPriceHistory(itemId: number): PriceEntry[] {
    const rows = this.db
      .prepare(
        `
      SELECT rowid AS id, price, recorded_at, not_for_sale FROM price_history
      WHERE item_id = @item_id ORDER BY recorded_at ASC
    `,
      )
      .all({ item_id: itemId }) as PriceEntryRow[];
    return rows.map((r) => ({
      id: r.id,
      price: r.price,
      recorded_at: r.recorded_at,
      not_for_sale: !!r.not_for_sale,
    }));
  }

  deletePriceEntry(id: number): void {
    this.db.prepare('DELETE FROM price_history WHERE rowid = @id').run({ id });
  }
}
