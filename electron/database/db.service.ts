import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import {
  WakfuItem,
  Recipe,
  PriceEntry,
  CraftSession,
  SessionItem,
  RecipeTreeNode,
  SessionStep,
  SessionPurchase,
  SessionCraftDone,
  SessionListing,
  SessionSale,
  SessionReport,
} from '../../src/electron';
import { MIGRATIONS } from './migrations';
import { fuzzyMatch } from '../shared/fuzzy-match';
import { SyncRepository } from './repositories/sync.repository';
import { ItemsRepository } from './repositories/items.repository';
import { PricesRepository } from './repositories/prices.repository';
import { SessionsRepository } from './repositories/sessions.repository';
import { SessionStepsRepository } from './repositories/session-steps.repository';

interface SettingRow {
  value: string;
}

export class DatabaseService {
  private db!: Database.Database;
  private sync!: SyncRepository;
  private items!: ItemsRepository;
  private prices!: PricesRepository;
  private sessions!: SessionsRepository;
  private sessionSteps!: SessionStepsRepository;

  initialize(): void {
    const dbPath = path.join(app.getPath('userData'), 'wakfu.db');
    console.log(`[DB] Ouverture de la base : ${dbPath}`);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.registerFunctions();
    this.runMigrations();
    this.sync = new SyncRepository(this.db);
    this.items = new ItemsRepository(this.db);
    this.prices = new PricesRepository(this.db);
    this.sessions = new SessionsRepository(this.db);
    this.sessionSteps = new SessionStepsRepository(this.db, this.prices);
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
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | SettingRow
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  getProfessionLevels(): Record<number, number> {
    const raw = this.getSetting('profession_levels');
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<number, number>;
    } catch {
      return {};
    }
  }

  setProfessionLevels(levels: Record<number, number>): void {
    this.setSetting('profession_levels', JSON.stringify(levels));
  }

  getGuildXpBonus(): number {
    return Number(this.getSetting('guild_xp_bonus') ?? '0');
  }

  setGuildXpBonus(bonus: number): void {
    this.setSetting('guild_xp_bonus', String(bonus));
  }

  importData(file: string, data: unknown[]): number {
    return this.sync.importData(file, data);
  }

  getItemTypes() {
    return this.items.getItemTypes();
  }

  getRecipeCategories() {
    return this.items.getRecipeCategories();
  }

  getRecipesByCategoryAndLevel(categoryId: number, minLevel: number, maxLevel: number) {
    return this.items.getRecipesByCategoryAndLevel(categoryId, minLevel, maxLevel);
  }

  getRecipesByItemIds(itemIds: number[]) {
    return this.items.getRecipesByItemIds(itemIds);
  }

  searchItems(
    query: string,
    lang: string = 'fr',
    typeIds: number[] = [],
    minLevel?: number,
    maxLevel?: number,
    rarities: number[] = [],
  ): WakfuItem[] {
    return this.items.searchItems(query, lang, typeIds, minLevel, maxLevel, rarities);
  }

  getRecipesByItemId(itemId: number): Recipe[] {
    return this.items.getRecipesByItemId(itemId);
  }

  setPrice(itemId: number, price: number): void {
    this.prices.setPrice(itemId, price);
  }

  setNotForSale(itemId: number): void {
    this.prices.setNotForSale(itemId);
  }

  getLatestPrices(itemIds: number[]): Record<number, number> {
    return this.prices.getLatestPrices(itemIds);
  }

  getLatestPriceEntries(itemIds: number[]): Record<number, PriceEntry> {
    return this.prices.getLatestPriceEntries(itemIds);
  }

  getPriceHistory(itemId: number): PriceEntry[] {
    return this.prices.getPriceHistory(itemId);
  }

  deletePriceEntry(id: number): void {
    this.prices.deletePriceEntry(id);
  }

  createSession(name: string): number {
    return this.sessions.createSession(name);
  }

  getSessions(): CraftSession[] {
    return this.sessions.getSessions();
  }

  renameSession(id: number, name: string): void {
    this.sessions.renameSession(id, name);
  }

  deleteSession(sessionId: number): void {
    this.sessions.deleteSession(sessionId);
  }

  addItemToSession(
    sessionId: number,
    itemId: number,
    quantity: number,
    recipeId: number | null,
    subRecipes: Record<number, number>,
  ): number {
    return this.sessions.addItemToSession(sessionId, itemId, quantity, recipeId, subRecipes);
  }

  removeItemFromSession(sessionItemId: number): void {
    this.sessions.removeItemFromSession(sessionItemId);
  }

  updateSessionItemQuantity(sessionItemId: number, quantity: number): void {
    this.sessions.updateSessionItemQuantity(sessionItemId, quantity);
  }

  getSessionItems(sessionId: number): SessionItem[] {
    return this.sessions.getSessionItems(sessionId);
  }

  getSessionTree(sessionId: number): RecipeTreeNode[] {
    return this.sessions.getSessionTree(sessionId);
  }

  setSessionStep(sessionId: number, step: SessionStep): void {
    this.sessionSteps.setSessionStep(sessionId, step);
  }

  addSessionPurchase(
    sessionId: number,
    itemId: number,
    unitPrice: number,
    quantity: number,
  ): number {
    return this.sessionSteps.addSessionPurchase(sessionId, itemId, unitPrice, quantity);
  }

  getSessionPurchases(sessionId: number): SessionPurchase[] {
    return this.sessionSteps.getSessionPurchases(sessionId);
  }

  deleteSessionPurchase(id: number): void {
    this.sessionSteps.deleteSessionPurchase(id);
  }

  upsertCraftDone(sessionId: number, itemId: number, quantityCrafted: number): void {
    this.sessionSteps.upsertCraftDone(sessionId, itemId, quantityCrafted);
  }

  getSessionCraftsDone(sessionId: number): SessionCraftDone[] {
    return this.sessionSteps.getSessionCraftsDone(sessionId);
  }

  addSessionListing(
    sessionItemId: number,
    parentListingId: number | null,
    unitPrice: number,
    quantity: number,
    taxRate: number,
  ): number {
    return this.sessionSteps.addSessionListing(
      sessionItemId,
      parentListingId,
      unitPrice,
      quantity,
      taxRate,
    );
  }

  getSessionListings(sessionId: number): SessionListing[] {
    return this.sessionSteps.getSessionListings(sessionId);
  }

  deleteSessionListing(id: number): void {
    this.sessionSteps.deleteSessionListing(id);
  }

  addSessionSale(listingId: number, quantity: number, soldAt?: string): number {
    return this.sessionSteps.addSessionSale(listingId, quantity, soldAt);
  }

  getSessionSales(sessionId: number): SessionSale[] {
    return this.sessionSteps.getSessionSales(sessionId);
  }

  getSessionReport(sessionId: number): SessionReport {
    return this.sessionSteps.getSessionReport(sessionId);
  }
}
