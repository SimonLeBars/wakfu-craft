import { Injectable, signal } from '@angular/core';
import { CraftSession, Recipe, SessionItem, ShoppingItem } from '@electron';

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly sessions      = signal<CraftSession[]>([]);
  readonly activeSession = signal<CraftSession | null>(null);
  readonly sessionItems  = signal<SessionItem[]>([]);
  readonly shoppingList  = signal<ShoppingItem[]>([]);
  readonly craftOrder    = signal<SessionItem[]>([]);

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

  // Ajoute un item en session et retourne son session_item_id.
  // L'appelant doit appeler refreshData() lorsque tous les ajouts sont terminés.
  async addItem(
    itemId:   number,
    quantity: number,
    parentId: number | null = null,
  ): Promise<number> {
    const session = this.activeSession();
    if (!session) return -1;
    return window.electronAPI.sessions.addItem(session.id, itemId, quantity, parentId);
  }

  async addItemTree(
    itemId:   number,
    quantity: number,
    craftIds: Set<number>,
    recipe:   Recipe | null,
    subRecs:  Partial<Record<number, Recipe | null>>,
    visited   = new Set<number>(),
    parentId: number | null = null,
  ): Promise<void> {
    const sessionItemId = await this.addItem(itemId, quantity, parentId);
    if (!recipe) return;
    for (const ing of recipe.ingredients) {
      if (!craftIds.has(ing.item_id) || visited.has(ing.item_id)) continue;
      visited.add(ing.item_id);
      await this.addItemTree(
        ing.item_id, ing.quantity * quantity, craftIds,
        subRecs[ing.item_id] ?? null, subRecs, visited, sessionItemId,
      );
    }
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
    const [items, shopping, craftOrder] = await Promise.all([
      window.electronAPI.sessions.getItems(session.id),
      window.electronAPI.sessions.getShoppingList(session.id),
      window.electronAPI.sessions.getCraftOrder(session.id),
    ]);
    this.sessionItems.set(items);
    this.shoppingList.set(shopping);
    this.craftOrder.set(craftOrder);
  }
}
