import { Injectable, computed, signal } from '@angular/core';
import { CraftSession, Recipe, RecipeTreeNode, ShoppingItem } from '@electron';

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly sessions      = signal<CraftSession[]>([]);
  readonly activeSession = signal<CraftSession | null>(null);
  readonly sessionItems  = signal<RecipeTreeNode[]>([]);

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
    const result: RecipeTreeNode[] = [];
    const visit = (node: RecipeTreeNode) => {
      for (const child of node.children) visit(child);
      result.push(node);
    };
    for (const root of this.sessionItems()) visit(root);
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
    const created = this.sessions().find(s => s.id === id);
    if (created) await this.selectSession(created);
  }

  async selectSession(session: CraftSession): Promise<void> {
    this.activeSession.set(session);
    await this.refreshSessionData();
  }

  async deleteSession(id: number): Promise<void> {
    await window.electronAPI.sessions.delete(id);
    if (this.activeSession()?.id === id) this.activeSession.set(null);
    await this.loadSessions();
  }

  async addItem(
    itemId:     number,
    quantity:   number,
    recipeId:   number | null = null,
    subRecipes: Record<number, number> = {},
  ): Promise<number> {
    const session = this.activeSession();
    if (!session) return -1;
    return window.electronAPI.sessions.addItem(session.id, itemId, quantity, recipeId, subRecipes);
  }

  async addItemTree(
    itemId:   number,
    quantity: number,
    craftIds: Set<number>,
    recipe:   Recipe | null,
    subRecs:  Partial<Record<number, Recipe | null>>,
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
      const updated = list.find(s => s.id === id);
      if (updated) this.activeSession.set(updated);
    }
  }

  async removeItem(sessionItemId: number): Promise<void> {
    await window.electronAPI.sessions.removeItem(sessionItemId);
    await this.refreshSessionData();
  }

  async updateQty(sessionItemId: number, qty: number): Promise<void> {
    if (qty <= 0) { await this.removeItem(sessionItemId); return; }
    await window.electronAPI.sessions.updateQty(sessionItemId, qty);
    await this.refreshSessionData();
  }

  private async refreshSessionData(): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    this.sessionItems.set(await window.electronAPI.sessions.getTree(session.id));
  }
}
