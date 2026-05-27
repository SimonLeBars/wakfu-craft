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
import { RecipeTreeNode, SessionListing } from '@electron';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';

interface ListingForm {
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

@Component({
  selector: 'app-session-listing-step',
  imports: [FormsModule, DecimalPipe, DatePipe, CopyBtnComponent, RarityColorPipe, RarityLabelPipe],
  templateUrl: './session-listing-step.component.html',
  styleUrl: './session-listing-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionListingStepComponent implements OnInit {
  protected readonly sessionService = inject(SessionService);

  protected readonly forms = signal<Partial<Record<number, ListingForm>>>({});

  protected readonly craftsDoneMap = computed(() =>
    this.sessionService.craftsDone().reduce((map, c) => {
      map.set(c.item_id, c);
      return map;
    }, new Map()),
  );

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

  protected readonly totalRevenue = computed(() =>
    this.sessionService
      .listings()
      .reduce((sum, l) => sum + l.unit_price * l.quantity_remaining * (1 - l.tax_rate / 100), 0),
  );

  async ngOnInit(): Promise<void> {
    await this.sessionService.loadCraftsDone();
    await this.sessionService.loadListings();

    const itemIds = this.sessionService.sessionItems().map((n) => n.item_id);
    const [lastPrices, defaultTaxRate] = await Promise.all([
      itemIds.length > 0
        ? window.electronAPI.getLatestPrices(itemIds)
        : Promise.resolve<Record<number, number>>({}),
      window.electronAPI.sessions.getLastTaxRate(),
    ]);

    const initial: Partial<Record<number, ListingForm>> = {};
    for (const node of this.sessionService.sessionItems()) {
      const crafted =
        this.craftsDoneMap().get(node.item_id)?.quantity_crafted ?? node.craft_quantity;
      const listed = (this.listingsByItem().get(node.session_item_id) ?? [])
        .filter((l) => l.parent_listing_id === null)
        .reduce((s, l) => s + l.quantity, 0);
      initial[node.session_item_id] = {
        quantity: Math.max(1, crafted - listed),
        unitPrice: lastPrices[node.item_id] ?? 0,
        taxRate: defaultTaxRate,
      };
    }
    this.forms.set(initial);
  }

  protected getQuantityCrafted(itemId: number, craftQty: number): number {
    return this.craftsDoneMap().get(itemId)?.quantity_crafted ?? craftQty;
  }

  protected getQuantityListed(sessionItemId: number): number {
    return (this.listingsByItem().get(sessionItemId) ?? [])
      .filter((l) => l.parent_listing_id === null)
      .reduce((s, l) => s + l.quantity, 0);
  }

  protected getCoverage(
    sessionItemId: number,
    itemId: number,
    craftQty: number,
  ): 'full' | 'partial' | 'none' {
    const crafted = this.getQuantityCrafted(itemId, craftQty);
    const listed = this.getQuantityListed(sessionItemId);
    if (listed >= crafted) return 'full';
    if (listed > 0) return 'partial';
    return 'none';
  }

  protected isAddDisabled(sessionItemId: number): boolean {
    const form = this.forms()[sessionItemId];
    return !form || form.quantity <= 0 || form.unitPrice <= 0;
  }

  protected updateForm(sessionItemId: number, field: keyof ListingForm, value: number): void {
    this.forms.update((f) => ({
      ...f,
      [sessionItemId]: {
        ...(f[sessionItemId] ?? { quantity: 1, unitPrice: 0, taxRate: 3 }),
        [field]: value,
      },
    }));
  }

  protected async onAddListing(node: RecipeTreeNode): Promise<void> {
    const form = this.forms()[node.session_item_id];
    if (!form || form.quantity <= 0 || form.unitPrice <= 0) return;
    await this.sessionService.addListing(
      node.session_item_id,
      form.unitPrice,
      form.quantity,
      form.taxRate,
    );
    const crafted = this.getQuantityCrafted(node.item_id, node.craft_quantity);
    const listed = this.getQuantityListed(node.session_item_id);
    this.forms.update((f) => ({
      ...f,
      [node.session_item_id]: { ...form, quantity: Math.max(1, crafted - listed) },
    }));
  }

  protected async onDeleteListing(id: number): Promise<void> {
    await this.sessionService.deleteListing(id);
  }

  protected async onNextStep(): Promise<void> {
    await this.sessionService.setStep('sale');
  }
}
