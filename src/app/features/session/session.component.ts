import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/services/session.service';
import { PriceService } from '../../core/services/price.service';
import { RarityColorPipe, RarityLabelPipe } from '../../shared/pipes/rarity.pipe';

@Component({
  selector: 'app-session',
  imports: [DecimalPipe, FormsModule, RarityColorPipe, RarityLabelPipe],
  templateUrl: './session.component.html',
  styleUrl: './session.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionComponent implements OnInit {
  protected readonly sessionService = inject(SessionService);
  protected readonly priceService   = inject(PriceService);

  protected readonly newSessionName = signal('');
  protected readonly showNewSession = signal(false);

  protected readonly totalCost = computed(() =>
    this.sessionService.shoppingList().reduce((sum, item) => {
      const price = this.priceService.getPrice(item.item_id) ?? 0;
      return sum + price * item.total_quantity;
    }, 0)
  );

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

  private async loadPrices(): Promise<void> {
    const ids = this.sessionService.shoppingList().map(i => i.item_id);
    if (ids.length > 0) await this.priceService.loadPricesForItems(ids);
  }
}
