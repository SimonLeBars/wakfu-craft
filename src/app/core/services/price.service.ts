import { Injectable, signal } from '@angular/core';
import { PriceEntry } from '@electron';

@Injectable({ providedIn: 'root' })
export class PriceService {
  readonly prices      = signal<Record<number, number>>({});
  readonly priceDates  = signal<Record<number, string>>({});
  readonly notForSale  = signal<Record<number, boolean>>({});

  async loadPricesForItems(itemIds: number[]): Promise<void> {
    const result = await window.electronAPI.getLatestPriceEntries(itemIds);
    const prices:     Record<number, number>  = {};
    const dates:      Record<number, string>  = {};
    const notForSale: Record<number, boolean> = {};
    for (const [id, entry] of Object.entries(result)) {
      notForSale[+id] = entry.not_for_sale;
      dates[+id]      = entry.recorded_at;
      if (!entry.not_for_sale) prices[+id] = entry.price;
    }
    this.prices.update(c     => ({ ...c, ...prices }));
    this.priceDates.update(c => ({ ...c, ...dates }));
    this.notForSale.update(c => ({ ...c, ...notForSale }));
  }

  async setPrice(itemId: number, price: number): Promise<void> {
    await window.electronAPI.setPrice(itemId, price);
    const now = new Date().toISOString();
    this.prices.update(c    => ({ ...c, [itemId]: price }));
    this.priceDates.update(c => ({ ...c, [itemId]: now }));
    this.notForSale.update(c => ({ ...c, [itemId]: false }));
  }

  async setNotForSale(itemId: number): Promise<void> {
    await window.electronAPI.setNotForSale(itemId);
    const now = new Date().toISOString();
    this.priceDates.update(c => ({ ...c, [itemId]: now }));
    this.notForSale.update(c => ({ ...c, [itemId]: true }));
  }

  getPrice(itemId: number): number | null {
    if (this.notForSale()[itemId]) return null;
    return this.prices()[itemId] ?? null;
  }

  isNotForSale(itemId: number): boolean {
    return this.notForSale()[itemId] ?? false;
  }

  getPriceDate(itemId: number): string | null {
    return this.priceDates()[itemId] ?? null;
  }

  async getHistory(itemId: number): Promise<PriceEntry[]> {
    return window.electronAPI.getPriceHistory(itemId);
  }
}
