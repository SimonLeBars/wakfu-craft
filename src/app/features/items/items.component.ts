import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemService } from '../../core/services/item.service';
import { PriceService } from '../../core/services/price.service';
import { WakfuItem } from '@electron';
import { ProfitabilityComponent } from './profitability/profitability.component';
import { SessionService } from '../../core/services/session.service';
import { PriceHistoryComponent } from './price-history/price-history.component';
import { IngredientRowComponent } from './ingredient-row/ingredient-row.component';

@Component({
  selector: 'app-items',
  imports: [DecimalPipe, FormsModule, ProfitabilityComponent, PriceHistoryComponent, IngredientRowComponent],
  templateUrl: './items.component.html',
  styleUrl: './items.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemsComponent {
  protected readonly itemService    = inject(ItemService);
  protected readonly priceService   = inject(PriceService);
  protected readonly sessionService = inject(SessionService);

  searchQuery = '';

  onSearch(): void {
    this.itemService.search(this.searchQuery);
  }

  onSelectItem(item: WakfuItem): void {
    this.itemService.selectItem(item);
  }

  async onSetSellPrice(value: string): Promise<void> {
    const item = this.itemService.selectedItem();
    if (!item) return;
    const price = parseFloat(value);
    if (!isNaN(price) && price >= 0) {
      await this.priceService.setPrice(item.id, price);
    }
  }

  async onAddToSession(): Promise<void> {
    const item = this.itemService.selectedItem();
    if (!item) return;
    if (this.sessionService.sessions().length === 0) {
      await this.sessionService.createSession('Ma session');
    }
    await this.sessionService.loadSessions();
    await this.sessionService.addItem(item.id, 1);
  }
}
