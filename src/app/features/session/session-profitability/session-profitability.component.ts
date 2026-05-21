import {
  Component,
  inject,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SessionService } from '@services/session.service';
import { PriceService } from '@services/price.service';
import { ProfessionProfileService } from '@services/profession-profile.service';
import { RecipeTreeNode, XpRecipe } from '@electron';
import { computeEffectiveXp } from '@services/xp-optimizer.utils';

@Component({
  selector: 'app-session-profitability',
  imports: [DecimalPipe],
  templateUrl: './session-profitability.component.html',
  styleUrl: './session-profitability.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionProfitabilityComponent {
  protected readonly sessionService = inject(SessionService);
  protected readonly priceService = inject(PriceService);
  private readonly profile = inject(ProfessionProfileService);

  private readonly xpRecipes = signal<XpRecipe[]>([]);

  protected readonly totalCost = computed(() =>
    this.sessionService.shoppingList().reduce((sum, item) => {
      const price = this.priceService.getPrice(item.item_id) ?? 0;
      return sum + price * item.total_quantity;
    }, 0),
  );

  protected readonly totalSellPrice = computed(() =>
    this.sessionService.sessionItems().reduce((sum, item) => {
      const price = this.priceService.getPrice(item.item_id) ?? 0;
      return sum + price * item.craft_quantity * item.result_quantity;
    }, 0),
  );

  protected readonly grossMargin = computed(() => this.totalSellPrice() - this.totalCost());

  protected readonly marginPercent = computed(() => {
    const cost = this.totalCost();
    return cost > 0 ? (this.grossMargin() / cost) * 100 : 0;
  });

  protected readonly missingCounts = computed(() => ({
    ingredients: this.sessionService
      .shoppingList()
      .filter((i) => !this.priceService.getPrice(i.item_id)).length,
    sell: this.sessionService.sessionItems().filter((i) => !this.priceService.getPrice(i.item_id))
      .length,
  }));

  protected readonly totalExpectedXp = computed(() => {
    const recipeMap = new Map(this.xpRecipes().map((r) => [r.item_id, r]));
    const levels = this.profile.levels();
    const guildXpBonus = this.profile.guildXpBonus();
    const xpForNode = (node: RecipeTreeNode): number => {
      const recipe = recipeMap.get(node.item_id);
      const own = recipe
        ? computeEffectiveXp(
            recipe.xp_ratio,
            recipe.recipe_level - (levels[recipe.category_id] ?? 1),
            guildXpBonus,
          ) * node.craft_quantity
        : 0;
      return own + node.children.reduce((s, c) => s + xpForNode(c), 0);
    };
    return this.sessionService.sessionItems().reduce((sum, root) => sum + xpForNode(root), 0);
  });

  constructor() {
    effect(() => {
      const items = this.sessionService.sessionItems();
      this.reloadXpRecipes(items);
    });
  }

  protected formatXp(val: number): string {
    if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + ' M';
    if (val >= 1_000) return (val / 1_000).toFixed(1) + ' K';
    return val.toFixed(0);
  }

  private async reloadXpRecipes(items: RecipeTreeNode[]): Promise<void> {
    const ids = new Set<number>();
    const collect = (node: RecipeTreeNode) => {
      ids.add(node.item_id);
      node.children.forEach(collect);
    };
    items.forEach(collect);
    if (ids.size === 0) {
      this.xpRecipes.set([]);
      return;
    }
    this.xpRecipes.set(await window.electronAPI.getRecipesByItemIds([...ids]));
  }
}
