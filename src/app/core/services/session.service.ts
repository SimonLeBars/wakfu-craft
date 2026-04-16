import { Injectable, signal } from '@angular/core';
import { CraftSession, SessionItem, ShoppingItem } from '@electron';

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly sessions        = signal<CraftSession[]>([]);
  readonly activeSession   = signal<CraftSession | null>(null);
  readonly sessionItems    = signal<SessionItem[]>([]);
  readonly shoppingList    = signal<ShoppingItem[]>([]);

  async loadSessions(): Promise<void> {
    const list = await window.electronAPI.sessions.getAll();
    this.sessions.set(list);
    // Active automatiquement la première session si aucune n'est active
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

  async addItem(itemId: number, quantity: number): Promise<void> {
    const session = this.activeSession();
    if (!session) return;
    await window.electronAPI.sessions.addItem(session.id, itemId, quantity);
    await this.refreshSessionData();
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
    const [items, shopping] = await Promise.all([
      window.electronAPI.sessions.getItems(session.id),
      window.electronAPI.sessions.getShoppingList(session.id),
    ]);
    this.sessionItems.set(items);
    this.shoppingList.set(shopping);
  }
}
