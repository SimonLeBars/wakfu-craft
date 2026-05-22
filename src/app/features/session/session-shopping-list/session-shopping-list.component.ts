import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SessionService } from '@services/session.service';
import { PriceService } from '@services/price.service';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';

@Component({
  selector: 'app-session-shopping-list',
  imports: [DecimalPipe, RarityColorPipe, RarityLabelPipe, CopyBtnComponent],
  templateUrl: './session-shopping-list.component.html',
  styleUrl: './session-shopping-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionShoppingListComponent {
  protected readonly sessionService = inject(SessionService);
  protected readonly priceService = inject(PriceService);

  protected readonly totalCost = computed(() =>
    this.sessionService.shoppingList().reduce((sum, item) => {
      const price = this.priceService.getPrice(item.item_id) ?? 0;
      return sum + price * item.total_quantity;
    }, 0),
  );
}
