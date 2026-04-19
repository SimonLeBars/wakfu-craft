import { Component, input, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RecipeIngredient, Recipe } from '@electron';
import { ItemService } from '../../../core/services/item.service';
import { PriceService } from '../../../core/services/price.service';
import { ProfitabilityService } from '../../../core/services/profitability.service';

@Component({
  selector: 'app-ingredient-row',
  // Auto-référence : Angular Ivy résout les imports de façon différée
  imports: [DecimalPipe, IngredientRowComponent],
  templateUrl: './ingredient-row.component.html',
  styleUrl: './ingredient-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngredientRowComponent {
  readonly ingredient   = input.required<RecipeIngredient>();
  /** Profondeur courante (0 = ingrédients directs de la recette principale) */
  readonly currentDepth = input<number>(0);
  /** Profondeur maximale toggle-able (les ingrédients à maxDepth ne peuvent plus être toggles) */
  readonly maxDepth     = input<number>(4);

  protected readonly itemService          = inject(ItemService);
  protected readonly priceService         = inject(PriceService);
  protected readonly profitabilityService = inject(ProfitabilityService);

  /** True si cet ingrédient est actuellement en mode "prix craft" */
  protected get isCraft(): boolean {
    return this.itemService.craftModeIngredients().has(this.ingredient().item_id);
  }

  /** Sous-recette chargée pour cet ingrédient (null si non encore chargée) */
  protected get subRecipe(): Recipe | null {
    return this.itemService.subRecipes()[this.ingredient().item_id] ?? null;
  }

  /**
   * Coût craft unitaire calculé par ProfitabilityService.
   * Retourne null si manquant (undefined → null pour que @if...as fonctionne).
   */
  protected get craftCost(): number | null {
    const cost = this.profitabilityService.result()?.subCraftCosts[this.ingredient().item_id];
    return cost !== undefined ? cost : null;
  }

  /** Le toggle n'est affiché que si l'ingrédient est craftable ET qu'on n'a pas atteint la profondeur max */
  protected get canToggle(): boolean {
    return this.ingredient().hasRecipe && this.currentDepth() < this.maxDepth();
  }

  protected readonly showSubRecipe = signal(true);
  protected toggleSubRecipe(): void { this.showSubRecipe.update(v => !v); }

  async onToggleCraftMode(): Promise<void> {
    await this.itemService.toggleCraftMode(this.ingredient().item_id);
  }

  async onSetPrice(value: string): Promise<void> {
    const price = parseFloat(value);
    if (!isNaN(price) && price >= 0) {
      await this.priceService.setPrice(this.ingredient().item_id, price);
    }
  }
}
