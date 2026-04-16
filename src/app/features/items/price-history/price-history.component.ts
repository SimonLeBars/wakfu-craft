import { Component, inject, signal, input, effect, ChangeDetectionStrategy } from '@angular/core';
import { PriceService } from '../../../core/services/price.service';
import { PriceChartComponent } from '../price-chart/price-chart.component';
import { PriceEntry, WakfuItem } from '@electron';

@Component({
  selector: 'app-price-history',
  imports: [PriceChartComponent],
  template: `
    @if (item()) {
      <app-price-chart
        [history]="history()"
        [itemName]="item()!.name['fr']"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceHistoryComponent {
  readonly item = input<WakfuItem | null>(null);

  private  readonly priceService = inject(PriceService);
  protected readonly history     = signal<PriceEntry[]>([]);

  constructor() {
    effect(async () => {
      const currentItem = this.item();
      if (currentItem) {
        const data = await this.priceService.getHistory(currentItem.id);
        this.history.set(data);
      } else {
        this.history.set([]);
      }
    });
  }
}
