import Database from 'better-sqlite3';
import {
  SessionStep,
  SessionPurchase,
  SessionCraftDone,
  SessionListing,
  SessionSale,
  SessionReport,
  SessionReportItem,
} from '../../../src/electron';
import { PricesRepository } from './prices.repository';

interface SessionPurchaseRow {
  id: number;
  session_id: number;
  item_id: number;
  item_name: string;
  unit_price: number;
  quantity: number;
  purchased_at: string;
}
interface SessionCraftDoneRow {
  id: number;
  session_item_id: number;
  quantity_crafted: number;
  crafted_at: string;
}
interface SessionListingRow {
  id: number;
  session_item_id: number;
  parent_listing_id: number | null;
  unit_price: number;
  quantity: number;
  tax_rate: number;
  listed_at: string;
  tax_amount: number;
  quantity_sold: number;
  quantity_remaining: number;
}
interface SessionSaleRow {
  id: number;
  listing_id: number;
  quantity: number;
  sold_at: string;
}
interface SessionReportItemRow {
  item_id: number;
  item_name: string;
  quantity_crafted: number;
  quantity_sold: number;
  quantity_remaining: number;
  first_listed_at: string | null;
  last_sold_at: string | null;
}

export class SessionStepsRepository {
  constructor(
    private db: Database.Database,
    private prices: PricesRepository,
  ) {}

  setSessionStep(sessionId: number, step: SessionStep): void {
    this.db.prepare('UPDATE craft_sessions SET step = ? WHERE id = ?').run(step, sessionId);
  }

  // ── Achats ──────────────────────────────────────────────────────────────────

  addSessionPurchase(
    sessionId: number,
    itemId: number,
    unitPrice: number,
    quantity: number,
  ): number {
    const result = this.db
      .prepare(
        'INSERT INTO session_purchases (session_id, item_id, unit_price, quantity) VALUES (?, ?, ?, ?)',
      )
      .run(sessionId, itemId, unitPrice, quantity);
    this.prices.setPrice(itemId, unitPrice);
    return result.lastInsertRowid as number;
  }

  getSessionPurchases(sessionId: number): SessionPurchase[] {
    const rows = this.db
      .prepare(
        `
      SELECT sp.id, sp.session_id, sp.item_id, i.name AS item_name,
             sp.unit_price, sp.quantity, sp.purchased_at
      FROM session_purchases sp
      JOIN items i ON i.id = sp.item_id
      WHERE sp.session_id = ?
      ORDER BY sp.purchased_at ASC
    `,
      )
      .all(sessionId) as SessionPurchaseRow[];
    return rows.map((r) => ({
      ...r,
      item_name: JSON.parse(r.item_name) as Record<string, string>,
    }));
  }

  deleteSessionPurchase(id: number): void {
    this.db.prepare('DELETE FROM session_purchases WHERE id = ?').run(id);
  }

  // ── Crafts effectués ────────────────────────────────────────────────────────

  upsertCraftDone(sessionItemId: number, quantityCrafted: number): void {
    this.db
      .prepare(
        `
      INSERT INTO session_crafts_done (session_item_id, quantity_crafted, crafted_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(session_item_id) DO UPDATE SET
        quantity_crafted = excluded.quantity_crafted,
        crafted_at       = excluded.crafted_at
    `,
      )
      .run(sessionItemId, quantityCrafted);
  }

  getSessionCraftsDone(sessionId: number): SessionCraftDone[] {
    return this.db
      .prepare(
        `
      SELECT cd.id, cd.session_item_id, cd.quantity_crafted, cd.crafted_at
      FROM session_crafts_done cd
      JOIN craft_session_items csi ON csi.id = cd.session_item_id
      WHERE csi.session_id = ?
    `,
      )
      .all(sessionId) as SessionCraftDoneRow[];
  }

  // ── Mises en vente ──────────────────────────────────────────────────────────

  addSessionListing(
    sessionItemId: number,
    parentListingId: number | null,
    unitPrice: number,
    quantity: number,
    taxRate: number,
  ): number {
    const itemRow = this.db
      .prepare('SELECT item_id FROM craft_session_items WHERE id = ?')
      .get(sessionItemId) as { item_id: number } | undefined;
    if (!itemRow) throw new Error(`Session item ${sessionItemId} not found`);

    const result = this.db
      .prepare(
        `
        INSERT INTO session_listings (session_item_id, parent_listing_id, unit_price, quantity, tax_rate)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(sessionItemId, parentListingId, unitPrice, quantity, taxRate);

    this.prices.setPrice(itemRow.item_id, unitPrice);
    return result.lastInsertRowid as number;
  }

  getSessionListings(sessionId: number): SessionListing[] {
    return this.db
      .prepare(
        `
      SELECT l.id, l.session_item_id, l.parent_listing_id,
             l.unit_price, l.quantity, l.tax_rate, l.listed_at,
             CAST(ROUND(l.unit_price * l.quantity * l.tax_rate / 100.0) AS INTEGER) AS tax_amount,
             COALESCE(SUM(s.quantity), 0) AS quantity_sold,
             l.quantity - COALESCE(SUM(s.quantity), 0) AS quantity_remaining
      FROM session_listings l
      JOIN craft_session_items csi ON csi.id = l.session_item_id
      LEFT JOIN session_sales s ON s.listing_id = l.id
      WHERE csi.session_id = ?
      GROUP BY l.id
      ORDER BY l.listed_at ASC
    `,
      )
      .all(sessionId) as SessionListingRow[];
  }

  deleteSessionListing(id: number): void {
    this.db.prepare('DELETE FROM session_listings WHERE id = ?').run(id);
  }

  // ── Ventes ──────────────────────────────────────────────────────────────────

  addSessionSale(listingId: number, quantity: number, soldAt?: string): number {
    const result = this.db
      .prepare(
        `INSERT INTO session_sales (listing_id, quantity, sold_at) VALUES (?, ?, COALESCE(?, datetime('now')))`,
      )
      .run(listingId, quantity, soldAt ?? null);
    return result.lastInsertRowid as number;
  }

  getSessionSales(sessionId: number): SessionSale[] {
    return this.db
      .prepare(
        `
      SELECT s.id, s.listing_id, s.quantity, s.sold_at
      FROM session_sales s
      JOIN session_listings l ON l.id = s.listing_id
      JOIN craft_session_items csi ON csi.id = l.session_item_id
      WHERE csi.session_id = ?
      ORDER BY s.sold_at ASC
    `,
      )
      .all(sessionId) as SessionSaleRow[];
  }

  // ── Compte-rendu ────────────────────────────────────────────────────────────

  getSessionReport(sessionId: number): SessionReport {
    const costRow = this.db
      .prepare(
        'SELECT COALESCE(SUM(unit_price * quantity), 0) AS total FROM session_purchases WHERE session_id = ?',
      )
      .get(sessionId) as { total: number };

    const taxRow = this.db
      .prepare(
        `
      SELECT COALESCE(SUM(l.unit_price * l.quantity * l.tax_rate / 100.0), 0) AS total
      FROM session_listings l
      JOIN craft_session_items csi ON csi.id = l.session_item_id
      WHERE csi.session_id = ?
    `,
      )
      .get(sessionId) as { total: number };

    const revenueRow = this.db
      .prepare(
        `
      SELECT COALESCE(SUM(s.quantity * l.unit_price), 0) AS total
      FROM session_sales s
      JOIN session_listings l ON l.id = s.listing_id
      JOIN craft_session_items csi ON csi.id = l.session_item_id
      WHERE csi.session_id = ?
    `,
      )
      .get(sessionId) as { total: number };

    const itemRows = this.db
      .prepare(
        `
      SELECT
        csi.item_id,
        i.name AS item_name,
        COALESCE(cd.quantity_crafted, 0)                                   AS quantity_crafted,
        COALESCE(sold.quantity_sold, 0)                                    AS quantity_sold,
        COALESCE(listed.quantity_listed, 0) - COALESCE(sold.quantity_sold, 0) AS quantity_remaining,
        first_l.listed_at                                                  AS first_listed_at,
        last_s.sold_at                                                     AS last_sold_at
      FROM craft_session_items csi
      JOIN items i ON i.id = csi.item_id
      LEFT JOIN session_crafts_done cd ON cd.session_item_id = csi.id
      LEFT JOIN (
        SELECT session_item_id, SUM(quantity) AS quantity_listed
        FROM session_listings GROUP BY session_item_id
      ) listed ON listed.session_item_id = csi.id
      LEFT JOIN (
        SELECT l.session_item_id, SUM(s.quantity) AS quantity_sold
        FROM session_sales s JOIN session_listings l ON l.id = s.listing_id
        GROUP BY l.session_item_id
      ) sold ON sold.session_item_id = csi.id
      LEFT JOIN (
        SELECT session_item_id, MIN(listed_at) AS listed_at
        FROM session_listings GROUP BY session_item_id
      ) first_l ON first_l.session_item_id = csi.id
      LEFT JOIN (
        SELECT l.session_item_id, MAX(s.sold_at) AS sold_at
        FROM session_sales s JOIN session_listings l ON l.id = s.listing_id
        GROUP BY l.session_item_id
      ) last_s ON last_s.session_item_id = csi.id
      WHERE csi.session_id = ?
    `,
      )
      .all(sessionId) as SessionReportItemRow[];

    const total_real_cost = costRow.total;
    const total_tax_paid = taxRow.total;
    const total_revenue = revenueRow.total;

    const items: SessionReportItem[] = itemRows.map((row) => ({
      item_id: row.item_id,
      item_name: JSON.parse(row.item_name) as Record<string, string>,
      quantity_crafted: row.quantity_crafted,
      quantity_sold: row.quantity_sold,
      quantity_remaining: row.quantity_remaining,
      first_listed_at: row.first_listed_at ?? null,
      last_sold_at: row.last_sold_at ?? null,
      days_to_sell:
        row.first_listed_at && row.last_sold_at
          ? (Date.parse(row.last_sold_at) - Date.parse(row.first_listed_at)) / 86_400_000
          : null,
    }));

    return {
      total_real_cost,
      total_tax_paid,
      total_revenue,
      net_profit: total_revenue - total_real_cost - total_tax_paid,
      items,
    };
  }
}
