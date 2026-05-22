import { Injectable, computed, signal } from '@angular/core';
import {
  CraftSession,
  Recipe,
  RecipeTreeNode,
  ShoppingItem,
  SessionStep,
  SessionPurchase,
  SessionCraftDone,
  SessionListing,
  SessionSale,
  SessionReport,
} from '@electron';

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly sessions = signal<CraftSession[]>([]);
  readonly activeSession = signal<CraftSession | null>(null);
  readonly sessionItems = signal<RecipeTreeNode[]>([]);
  readonly purchases = signal<SessionPurchase[]>([]);
  readonly craftsDone = signal<SessionCraftDone[]>([]);
  readonly listings = signal<SessionListing[]>([]);
  readonly sales = signal<SessionSale[]>([]);
  readonly report = signal<SessionReport | null>(null);

  readonly shoppingList = computed<ShoppingItem[]>(() => {
    const aggregated = new Map<number, ShoppingItem>();
    const visit = (node: RecipeTreeNode) => {
      for (const ing of node.bought_ingredients) {
        const existing = aggregated.get(ing.item_id);
        if (existing) {
          existing.total_quantity += ing.quantity;
        } else {
          aggregated.set(ing.item_id, { ...ing, total_quantity: ing.quantity });
        }
      }
      for (const child of node.children) visit(child);
    };
    for (const root of this.sessionItems()) visit(root);
    return [...aggregated.values()].sort((a, b) => (b.item_level ?? 0) - (a.item_level ?? 0));
  });

  readonly craftOrder = computed<RecipeTreeNode[]>(() => {
    // 1. Collect all crafted nodes grouped by item_id, merging qty and deps
    const steps = new Map<number, { node: RecipeTreeNode; qty: number; deps: Set<number> }>();
    const collect = (node: RecipeTreeNode) => {
      for (const child of node.children) collect(child);
      const childIds = new Set(node.children.map((c) => c.item_id));
      const existing = steps.get(node.item_id);
      if (existing) {
        existing.qty += node.craft_quantity;
        for (const id of childIds) existing.deps.add(id);
      } else {
        steps.set(node.item_id, { node: { ...node }, qty: node.craft_quantity, deps: childIds });
      }
    };
    for (const root of this.sessionItems()) collect(root);

    // 2. Build in-degree map and reverse adjacency (dep → items that need it)
    const inDegree = new Map<number, number>([...steps.keys()].map((id) => [id, 0]));
    const dependents = new Map<number, number[]>([...steps.keys()].map((id) => [id, []]));
    for (const [itemId, { deps }] of steps) {
      for (const depId of deps) {
        inDegree.set(itemId, inDegree.get(itemId)! + 1);
        dependents.get(depId)!.push(itemId);
      }
    }

    // 3. Kahn's topological sort — leaves (no deps) first, roots last
    const queue = [...steps.keys()].filter((id) => inDegree.get(id) === 0);
    const result: RecipeTreeNode[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const step = steps.get(id)!;
      result.push({ ...step.node, craft_quantity: step.qty });
      for (const dependent of dependents.get(id)!) {
        const deg = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, deg);
        if (deg === 0) queue.push(dependent);
      }
    }
    return result;
  });

  async loadSessions(): Promise<void> {
    const list = await window.electronAPI.sessions.getAll();
    this.sessions.set(list);
    if (!this.activeSession() && list.length > 0) {
      await this.selectSession(list[0]);
    }
  }

  async createSession(name: string): Promise<void> {
    const id = await window.electronAPI.sessions.create(name);
    await this.loadSessions();
    const created = this.sessions().find((s) => s.id === id);
    if (created) await this.selectSession(created);
  }

  async selectSession(session: CraftSession): Promise<void> {
    this.activeSession.set(session);
    await this.refreshSessionData();
    if (session.step === 'purchase') await this.loadPurchases();
    if (session.step === 'craft') await this.loadCraftsDone();
    if (session.step === 'listing') {
      await this.loadCraftsDone();
      await this.loadListings();
    }
    if (session.step === 'sale') {
      await this.loadListings();
      await this.loadSales();
      await this.loadReport();
    }
  }

  async setStep(step: SessionStep): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    await window.electronAPI.sessions.setStep(session.id, step);
    this.activeSession.update((s) => (s ? { ...s, step } : null));
    this.sessions.update((list) => list.map((s) => (s.id === session.id ? { ...s, step } : s)));
  }

  async loadPurchases(): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    this.purchases.set(await window.electronAPI.sessions.getPurchases(session.id));
  }

  async addPurchase(itemId: number, unitPrice: number, quantity: number): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    await window.electronAPI.sessions.addPurchase(session.id, itemId, unitPrice, quantity);
    await this.loadPurchases();
  }

  async deletePurchase(id: number): Promise<void> {
    await window.electronAPI.sessions.deletePurchase(id);
    await this.loadPurchases();
  }

  async loadCraftsDone(): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    this.craftsDone.set(await window.electronAPI.sessions.getCraftsDone(session.id));
  }

  async loadListings(): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    this.listings.set(await window.electronAPI.sessions.getListings(session.id));
  }

  async addListing(
    sessionItemId: number,
    unitPrice: number,
    quantity: number,
    taxRate: number,
  ): Promise<void> {
    await window.electronAPI.sessions.addListing(sessionItemId, null, unitPrice, quantity, taxRate);
    await this.loadListings();
  }

  async deleteListing(id: number): Promise<void> {
    await window.electronAPI.sessions.deleteListing(id);
    await this.loadListings();
  }

  async loadSales(): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    this.sales.set(await window.electronAPI.sessions.getSales(session.id));
  }

  async addSale(listingId: number, quantity: number, soldAt?: string): Promise<void> {
    await window.electronAPI.sessions.addSale(listingId, quantity, soldAt);
    await Promise.all([this.loadListings(), this.loadSales(), this.loadReport()]);
  }

  async loadReport(): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    this.report.set(await window.electronAPI.sessions.getReport(session.id));
  }

  async upsertCraftDone(itemId: number, qty: number): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    await window.electronAPI.sessions.upsertCraftDone(session.id, itemId, qty);
    await this.loadCraftsDone();
  }

  async deleteSession(id: number): Promise<void> {
    await window.electronAPI.sessions.delete(id);
    if (this.activeSession()?.id === id) this.activeSession.set(null);
    await this.loadSessions();
  }

  async addItem(
    itemId: number,
    quantity: number,
    recipeId: number | null = null,
    subRecipes: Record<number, number> = {},
  ): Promise<number> {
    const session = this.activeSession();
    if (!session) return -1;
    return window.electronAPI.sessions.addItem(session.id, itemId, quantity, recipeId, subRecipes);
  }

  async addItemTree(
    itemId: number,
    quantity: number,
    craftIds: Set<number>,
    recipe: Recipe | null,
    subRecs: Partial<Record<number, Recipe | null>>,
  ): Promise<void> {
    const subRecipes: Record<number, number> = {};
    for (const craftedId of craftIds) {
      const r = subRecs[craftedId];
      if (r?.id != null) subRecipes[craftedId] = r.id;
    }
    await this.addItem(itemId, quantity, recipe?.id ?? null, subRecipes);
  }

  async refreshData(): Promise<void> {
    await this.refreshSessionData();
  }

  async renameSession(id: number, name: string): Promise<void> {
    await window.electronAPI.sessions.rename(id, name);
    const list = await window.electronAPI.sessions.getAll();
    this.sessions.set(list);
    const active = this.activeSession();
    if (active?.id === id) {
      const updated = list.find((s) => s.id === id);
      if (updated) this.activeSession.set(updated);
    }
  }

  async removeItem(sessionItemId: number): Promise<void> {
    await window.electronAPI.sessions.removeItem(sessionItemId);
    await this.refreshSessionData();
  }

  async updateQty(sessionItemId: number, qty: number): Promise<void> {
    if (qty <= 0) {
      await this.removeItem(sessionItemId);
      return;
    }
    await window.electronAPI.sessions.updateQty(sessionItemId, qty);
    await this.refreshSessionData();
  }

  private async refreshSessionData(): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    this.sessionItems.set(await window.electronAPI.sessions.getTree(session.id));
  }
}
