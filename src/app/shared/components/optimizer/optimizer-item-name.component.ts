import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';
import { BlockedCraft } from '@services/xp-optimizer.utils';

@Component({
  selector: 'td[appOptimizerItemName]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RarityColorPipe, RarityLabelPipe],
  styles: [`
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: normal;
      min-width: 160px;
      padding: 9px 12px;
    }
    .price-dot {
      flex-shrink: 0;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      &--error { background: #ef4444; box-shadow: 0 0 4px rgba(239, 68, 68, 0.5); }
      &--warn  { background: #f97316; box-shadow: 0 0 4px rgba(249, 115, 22, 0.4); }
      &--level { background: #3b82f6; box-shadow: 0 0 4px rgba(59, 130, 246, 0.4); cursor: help; }
    }
    .item-name { margin-right: 2px; }
    .qty-badge {
      font-size: 0.7rem;
      background: var(--craft-bg);
      color: var(--craft);
      padding: 1px 5px;
      border-radius: 8px;
      font-weight: 600;
    }
  `],
  template: `
    @if (hasMissingPrices()) {
      <span class="price-dot price-dot--error"
            role="img"
            aria-label="Prix manquants"
            title="Prix manquants pour certains ingrédients"></span>
    } @else if (hasStalePrices()) {
      <span class="price-dot price-dot--warn"
            role="img"
            aria-label="Prix anciens"
            title="Certains prix datent de plus d'un jour"></span>
    }
    @if (blockedSubCrafts().length > 0) {
      <span class="price-dot price-dot--level"
            role="img"
            aria-label="Craft moins cher possible avec un niveau de métier plus élevé"
            [title]="blockedTitle()"></span>
    }
    <span class="item-name">{{ itemName()['fr'] }}</span>
    <span class="badge-rarity" [style.color]="rarity() | rarityColor">{{ rarity() | rarityLabel }}</span>
    @if (resultQuantity() > 1) {
      <span class="qty-badge">×{{ resultQuantity() }}</span>
    }
  `,
})
export class OptimizerItemNameComponent {
  readonly hasMissingPrices = input.required<boolean>();
  readonly hasStalePrices   = input.required<boolean>();
  readonly blockedSubCrafts = input.required<BlockedCraft[]>();
  readonly itemName         = input.required<Record<string, string>>();
  readonly rarity           = input.required<number>();
  readonly resultQuantity   = input.required<number>();

  protected readonly blockedTitle = computed(() =>
    this.blockedSubCrafts().map(c =>
      `${c.item_name['fr']} serait moins cher à crafter\n  → ${c.category_name['fr']} niv. ${c.required_level} requis`
    ).join('\n')
  );
}
