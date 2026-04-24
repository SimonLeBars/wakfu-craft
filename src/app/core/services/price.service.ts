import { Injectable, signal } from '@angular/core';
import { PriceEntry } from '@electron';

@Injectable({ providedIn: 'root' })
export class PriceService {
  readonly prices      = signal<Record<number, number>>({});
  readonly priceDates  = signal<Record<number, string>>({});

  async loadPricesForItems(itemIds: number[]): Promise<void> {
    const result = await window.electronAPI.getLatestPriceEntries(itemIds);
    const prices: Record<number, number> = {};
    const dates:  Record<number, string> = {};
    for (const [id, entry] of Object.entries(result)) {
      prices[+id] = entry.price;
      dates[+id]  = entry.recorded_at;
    }
    this.prices.update(current     => ({ ...current, ...prices }));
    this.priceDates.update(current => ({ ...current, ...dates  }));
  }

  async setPrice(itemId: number, price: number): Promise<void> {
    await window.electronAPI.setPrice(itemId, price);
    const now = new Date().toISOString();
    this.prices.update(current     => ({ ...current, [itemId]: price }));
    this.priceDates.update(current => ({ ...current, [itemId]: now   }));
  }

  getPrice(itemId: number): number | null {
    return this.prices()[itemId] ?? null;
  }

  getPriceDate(itemId: number): string | null {
    return this.priceDates()[itemId] ?? null;
  }

  async getHistory(itemId: number): Promise<PriceEntry[]> {
    return window.electronAPI.getPriceHistory(itemId);
  }
}
