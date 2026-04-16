import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ProfitabilityService } from '../../../core/services/profitability.service';
import { ItemService } from '../../../core/services/item.service';
import { ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-profitability',
  imports: [DecimalPipe],
  templateUrl: './profitability.component.html',
  styleUrl: './profitability.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfitabilityComponent {
  protected readonly profitabilityService = inject(ProfitabilityService);
  protected readonly itemService          = inject(ItemService);
}
