import {
  Component,
  OnInit,
  inject,
  computed,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { SessionService } from '@services/session.service';
import { SessionListing } from '@electron';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';

interface SaleForm {
  quantity: number;
  soldAt: string;
}

interface RelistForm {
  unitPrice: number;
  quantity: number;
  taxRate: number;
}

@Component({
  selector: 'app-session-sale-step',
  imports: [FormsModule, DecimalPipe, DatePipe, CopyBtnComponent, RarityColorPipe, RarityLabelPipe],
  templateUrl: './session-sale-step.component.html',
  styleUrl: './session-sale-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionSaleStepComponent implements OnInit {
  protected readonly sessionService = inject(SessionService);

  protected readonly today: string = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  protected readonly forms = signal<Partial<Record<number, SaleForm>>>({});
  protected readonly relistForms = signal<Partial<Record<number, RelistForm>>>({});
  private readonly defaultTaxRate = signal<number>(3);

  protected readonly listingsByItem = computed(() =>
    this.sessionService.listings().reduce((map, l) => {
      map.set(l.session_item_id, [...(map.get(l.session_item_id) ?? []), l]);
      return map;
    }, new Map<number, SessionListing[]>()),
  );

  protected readonly relistedListingIds = computed(() => {
    const ids = new Set<number>();
    for (const l of this.sessionService.listings()) {
      if (l.parent_listing_id !== null) ids.add(l.parent_listing_id);
    }
    return ids;
  });

  private readonly sessionItemIdByItemId = computed(() =>
    this.sessionService.sessionItems().reduce((map, node) => {
      map.set(node.item_id, node.session_item_id);
      return map;
    }, new Map<number, number>()),
  );

  protected readonly expectedGrossRevenue = computed(() =>
    this.sessionService.listings().reduce((sum, l) => sum + l.unit_price * l.quantity_remaining, 0),
  );

  protected readonly expectedNetProfit = computed(() => {
    const r = this.sessionService.report();
    if (!r) return null;
    return r.total_revenue + this.expectedGrossRevenue() - r.total_real_cost - r.total_tax_paid;
  });

  protected readonly expectedRoi = computed(() => {
    const r = this.sessionService.report();
    if (!r || r.total_real_cost === 0) return null;
    const np = this.expectedNetProfit();
    if (np === null) return null;
    return (np / r.total_real_cost) * 100;
  });

  protected readonly roi = computed(() => {
    const r = this.sessionService.report();
    if (!r || r.total_real_cost === 0) return null;
    return (r.net_profit / r.total_real_cost) * 100;
  });

  protected readonly reportItemsExtended = computed(() => {
    const r = this.sessionService.report();
    if (!r) return [];
    const siByItemId = this.sessionItemIdByItemId();
    const lByItem = this.listingsByItem();
    return r.items.map((item) => {
      const siId = siByItemId.get(item.item_id);
      const listings = siId ? (lByItem.get(siId) ?? []) : [];
      const netSoldRevenue = listings.reduce(
        (sum, l) => sum + l.unit_price * l.quantity_sold * (1 - l.tax_rate / 100),
        0,
      );
      const dailyGain =
        item.days_to_sell != null && item.days_to_sell > 0
          ? netSoldRevenue / item.days_to_sell
          : null;
      return { ...item, netSoldRevenue, dailyGain };
    });
  });

  async ngOnInit(): Promise<void> {
    const [taxRate] = await Promise.all([
      window.electronAPI.sessions.getLastTaxRate(),
      this.sessionService.loadListings(),
      this.sessionService.loadSales(),
      this.sessionService.loadReport(),
    ]);
    this.defaultTaxRate.set(taxRate);
    const initial: Partial<Record<number, SaleForm>> = {};
    for (const listing of this.sessionService.listings()) {
      if (listing.quantity_remaining > 0) {
        initial[listing.id] = { quantity: listing.quantity_remaining, soldAt: this.today };
      }
    }
    this.forms.set(initial);
  }

  protected getQuantitySold(sessionItemId: number): number {
    return (this.listingsByItem().get(sessionItemId) ?? []).reduce(
      (s, l) => s + l.quantity_sold,
      0,
    );
  }

  protected getQuantityListed(sessionItemId: number): number {
    return (this.listingsByItem().get(sessionItemId) ?? [])
      .filter((l) => l.parent_listing_id === null)
      .reduce((s, l) => s + l.quantity, 0);
  }

  protected getCoverage(sessionItemId: number): 'full' | 'partial' | 'none' {
    const listed = this.getQuantityListed(sessionItemId);
    const sold = this.getQuantitySold(sessionItemId);
    if (listed === 0) return 'none';
    if (sold >= listed) return 'full';
    if (sold > 0) return 'partial';
    return 'none';
  }

  protected getItemDaysToSell(sessionItemId: number): number | null {
    const node = this.sessionService
      .sessionItems()
      .find((n) => n.session_item_id === sessionItemId);
    if (!node) return null;
    return this.reportItemsExtended().find((r) => r.item_id === node.item_id)?.days_to_sell ?? null;
  }

  protected getItemDailyGain(sessionItemId: number): number | null {
    const node = this.sessionService
      .sessionItems()
      .find((n) => n.session_item_id === sessionItemId);
    if (!node) return null;
    return this.reportItemsExtended().find((r) => r.item_id === node.item_id)?.dailyGain ?? null;
  }

  protected updateForm(listingId: number, field: keyof SaleForm, value: number | string): void {
    this.forms.update((f) => ({
      ...f,
      [listingId]: {
        ...(f[listingId] ?? { quantity: 1, soldAt: this.today }),
        [field]: value,
      },
    }));
  }

  protected isAddDisabled(listingId: number): boolean {
    const form = this.forms()[listingId];
    return !form || form.quantity <= 0;
  }

  protected async onAddSale(listingId: number): Promise<void> {
    const form = this.forms()[listingId];
    if (!form || form.quantity <= 0) return;
    await this.sessionService.addSale(listingId, form.quantity, form.soldAt || undefined);
    const listing = this.sessionService.listings().find((l) => l.id === listingId);
    if (listing && listing.quantity_remaining > 0) {
      this.forms.update((f) => ({
        ...f,
        [listingId]: { ...form, quantity: listing.quantity_remaining },
      }));
    } else {
      this.forms.update((f) => {
        const next = { ...f };
        delete next[listingId];
        return next;
      });
    }
  }

  protected openRelistForm(listing: SessionListing): void {
    this.relistForms.update((f) => ({
      ...f,
      [listing.id]: {
        unitPrice: listing.unit_price,
        quantity: listing.quantity_remaining,
        taxRate: this.defaultTaxRate(),
      },
    }));
  }

  protected closeRelistForm(listingId: number): void {
    this.relistForms.update((f) => {
      const next = { ...f };
      delete next[listingId];
      return next;
    });
  }

  protected updateRelistForm(listingId: number, field: keyof RelistForm, value: number): void {
    this.relistForms.update((f) => ({
      ...f,
      [listingId]: {
        ...(f[listingId] ?? { unitPrice: 0, quantity: 1, taxRate: this.defaultTaxRate() }),
        [field]: value,
      },
    }));
  }

  protected isRelistDisabled(listingId: number): boolean {
    const form = this.relistForms()[listingId];
    return !form || form.unitPrice <= 0 || form.quantity <= 0;
  }

  protected async onRelist(listingId: number, sessionItemId: number): Promise<void> {
    const form = this.relistForms()[listingId];
    if (!form || form.unitPrice <= 0 || form.quantity <= 0) return;
    await this.sessionService.relistListing(
      listingId,
      sessionItemId,
      form.unitPrice,
      form.quantity,
      form.taxRate,
    );
    this.closeRelistForm(listingId);
  }

  protected formatDays(days: number | null): string {
    if (days === null) return '—';
    if (days < 1) return '< 1j';
    return `${days.toFixed(1)}j`;
  }
}
