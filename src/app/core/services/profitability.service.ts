import { Injectable, inject, computed } from '@angular/core';
import { PriceService } from './price.service';
import { ItemService } from './item.service';
import { Recipe } from '@electron';

export interface ProfitabilityResult {
  resourceCost:  number;
  sellPrice:     number;
  grossMargin:   number;
  marginPercent: number;
  missingPrices: number[];
  isComplete:    boolean;
  /** Coût craft unitaire (hors quantité) par item_id, pour tous les niveaux en mode craft */
  subCraftCosts: Partial<Record<number, number>>;
}

@Injectable({ providedIn: 'root' })
export class ProfitabilityService {
  private readonly priceService = inject(PriceService);
  private readonly itemService  = inject(ItemService);

  readonly result = computed<ProfitabilityResult | null>(() => {
    const item   = this.itemService.selectedItem();
    const recipe = this.itemService.selectedRecipe();
    if (!item || !recipe) return null;

    const craftMode  = this.itemService.craftModeIngredients();
    const subRecipes = this.itemService.subRecipes();

    const missingPrices: number[] = [];
    const subCraftCosts: Partial<Record<number, number>> = {};
    let resourceCost = 0;

    for (const ing of recipe.ingredients) {
      const unitCost = this.computeUnitCost(
        ing.item_id, craftMode, subRecipes, subCraftCosts, missingPrices, 2
      );
      if (unitCost !== null) {
        resourceCost += unitCost * ing.quantity;
      }
    }

    const sellPrice     = this.priceService.getPrice(item.id) ?? 0;
    const grossMargin   = sellPrice - resourceCost;
    const marginPercent = resourceCost > 0 ? (grossMargin / resourceCost) * 100 : 0;

    return {
      resourceCost,
      sellPrice,
      grossMargin,
      marginPercent,
      missingPrices: [...new Set(missingPrices)],
      isComplete: missingPrices.length === 0 && sellPrice > 0,
      subCraftCosts,
    };
  });

  /**
   * Calcule récursivement le coût unitaire (pour 1 exemplaire) d'un item.
   *
   * @param maxDepth  Niveaux de craft restants autorisés.
   *                  0 = toujours prix marché, 1 = 1 niveau, 2 = 2 niveaux…
   *
   * Retourne null si un ou plusieurs prix sont manquants (et les enregistre
   * dans missingPrices). Remplit subCraftCosts pour l'affichage dans l'UI.
   */
  private computeUnitCost(
    itemId:        number,
    craftMode:     Set<number>,
    subRecipes:    Partial<Record<number, Recipe | null>>,
    subCraftCosts: Partial<Record<number, number>>,
    missingPrices: number[],
    maxDepth:      number,
  ): number | null {
    if (maxDepth > 0 && craftMode.has(itemId)) {
      const subRecipe = subRecipes[itemId];
      if (subRecipe) {
        let total    = 0;
        let complete = true;
        for (const subIng of subRecipe.ingredients) {
          const subCost = this.computeUnitCost(
            subIng.item_id, craftMode, subRecipes, subCraftCosts, missingPrices, maxDepth - 1
          );
          if (subCost === null) {
            complete = false;
          } else {
            total += subCost * subIng.quantity;
          }
        }
        if (complete) {
          subCraftCosts[itemId] = total;
          return total;
        }
        return null;
      }
      // Sous-recette pas encore chargée → retombe sur le prix marché
    }

    const price = this.priceService.getPrice(itemId);
    if (price === null) missingPrices.push(itemId);
    return price;
  }
}
