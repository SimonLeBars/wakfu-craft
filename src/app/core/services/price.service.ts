import { Injectable, signal } from '@angular/core';
import { PriceEntry } from '@electron';

@Injectable({ providedIn: 'root' })
export class PriceService {
  // Cache local des prix : itemId → prix
  readonly prices = signal<Record<number, number>>({});

  async loadPricesForItems(itemIds: number[]): Promise<void> {
    const result = await window.electronAPI.getLatestPrices(itemIds);
    this.prices.update(current => ({ ...current, ...result }));
  }

  async setPrice(itemId: number, price: number): Promise<void> {
    await window.electronAPI.setPrice(itemId, price);
    this.prices.update(current => ({ ...current, [itemId]: price }));
  }

  getPrice(itemId: number): number | null {
    return this.prices()[itemId] ?? null;
  }

  async getHistory(itemId: number): Promise<PriceEntry[]> {
    return window.electronAPI.getPriceHistory(itemId);
  }
}
