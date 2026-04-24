import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/services/session.service';
import { PriceService } from '../../core/services/price.service';
import { CraftSession } from '@electron';
import { RarityColorPipe, RarityLabelPipe } from '../../shared/pipes/rarity.pipe';
import { CopyBtnComponent } from '../../shared/components/copy-btn.component';

@Component({
  selector: 'app-session',
  imports: [DecimalPipe, FormsModule, RarityColorPipe, RarityLabelPipe, CopyBtnComponent],
  templateUrl: './session.component.html',
  styleUrl: './session.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionComponent implements OnInit {
  protected readonly sessionService = inject(SessionService);
  protected readonly priceService   = inject(PriceService);

  protected readonly newSessionName = signal('');
  protected readonly showNewSession = signal(false);

  protected readonly renamingId  = signal<number | null>(null);
  protected readonly renameValue = signal('');

  protected readonly totalCost = computed(() =>
    this.sessionService.shoppingList().reduce((sum, item) => {
      const price = this.priceService.getPrice(item.item_id) ?? 0;
      return sum + price * item.total_quantity;
    }, 0)
  );

  protected readonly totalSellPrice = computed(() =>
    this.sessionService.sessionItems().reduce((sum, item) => {
      const price = this.priceService.getPrice(item.item_id) ?? 0;
      return sum + price * item.craft_quantity * item.result_quantity;
    }, 0)
  );

  protected readonly grossMargin = computed(() => this.totalSellPrice() - this.totalCost());

  protected readonly marginPercent = computed(() => {
    const cost = this.totalCost();
    return cost > 0 ? (this.grossMargin() / cost) * 100 : 0;
  });

  protected readonly missingCounts = computed(() => ({
    ingredients: this.sessionService.shoppingList().filter(i => !this.priceService.getPrice(i.item_id)).length,
    sell:        this.sessionService.sessionItems().filter(i => !this.priceService.getPrice(i.item_id)).length,
  }));

  async ngOnInit(): Promise<void> {
    await this.sessionService.loadSessions();
    await this.loadPrices();
  }

  async onCreateSession(): Promise<void> {
    if (!this.newSessionName().trim()) return;
    await this.sessionService.createSession(this.newSessionName().trim());
    this.newSessionName.set('');
    this.showNewSession.set(false);
    await this.loadPrices();
  }

  async onRemoveItem(sessionItemId: number): Promise<void> {
    await this.sessionService.removeItem(sessionItemId);
    await this.loadPrices();
  }

  async onUpdateQty(sessionItemId: number, value: string): Promise<void> {
    const qty = parseInt(value, 10);
    if (!isNaN(qty)) {
      await this.sessionService.updateQty(sessionItemId, qty);
      await this.loadPrices();
    }
  }

  onStartRename(session: CraftSession, event: Event): void {
    event.stopPropagation();
    this.renamingId.set(session.id);
    this.renameValue.set(session.name);
  }

  async onConfirmRename(): Promise<void> {
    const id   = this.renamingId();
    const name = this.renameValue().trim();
    if (id !== null && name) {
      await this.sessionService.renameSession(id, name);
    }
    this.renamingId.set(null);
  }

  onCancelRename(event?: Event): void {
    event?.stopPropagation();
    this.renamingId.set(null);
  }

  private async loadPrices(): Promise<void> {
    const ingredientIds = this.sessionService.shoppingList().map(i => i.item_id);
    const sessionItemIds = this.sessionService.sessionItems().map(i => i.item_id);
    const ids = [...new Set([...ingredientIds, ...sessionItemIds])];
    if (ids.length > 0) await this.priceService.loadPricesForItems(ids);
  }
}
