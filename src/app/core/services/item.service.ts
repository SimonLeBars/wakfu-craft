import { Injectable, signal, inject } from '@angular/core';
import { PriceService } from './price.service';
import { Recipe, WakfuItem } from '@electron';

@Injectable({ providedIn: 'root' })
export class ItemService {
  private priceService = inject(PriceService);

  readonly searchResults        = signal<WakfuItem[]>([]);
  readonly selectedItem         = signal<WakfuItem | null>(null);
  readonly selectedRecipe       = signal<Recipe | null>(null);
  readonly isLoading            = signal(false);
  readonly craftModeIngredients = signal<Set<number>>(new Set());
  readonly subRecipes           = signal<Partial<Record<number, Recipe | null>>>({});

  async search(query: string): Promise<void> {
    if (query.length < 2) { this.searchResults.set([]); return; }
    this.isLoading.set(true);
    try {
      const results = await window.electronAPI.searchItems(query, 'fr');
      this.searchResults.set(results);
    } finally {
      this.isLoading.set(false);
    }
  }

  async selectItem(item: WakfuItem): Promise<void> {
    this.selectedItem.set(item);
    this.selectedRecipe.set(null);
    this.craftModeIngredients.set(new Set());
    this.subRecipes.set({});

    const recipe = await window.electronAPI.getRecipeByItemId(item.id);
    this.selectedRecipe.set(recipe);

    if (recipe) {
      const ids = [item.id, ...recipe.ingredients.map(i => i.item_id)];
      await this.priceService.loadPricesForItems(ids);
    }
  }

  /**
   * Bascule le mode craft pour un ingrédient.
   * En mode craft, le coût de l'ingrédient est calculé depuis sa propre recette
   * plutôt que depuis son prix marché.
   */
  async toggleCraftMode(itemId: number): Promise<void> {
    const current = this.craftModeIngredients();
    const next = new Set(current);

    if (next.has(itemId)) {
      next.delete(itemId);
      this.craftModeIngredients.set(next);
    } else {
      // Mise à jour optimiste : le toggle est visible immédiatement
      next.add(itemId);
      this.craftModeIngredients.set(next);

      // Charger la sous-recette si pas encore en cache
      if (!(itemId in this.subRecipes())) {
        const recipe = await window.electronAPI.getRecipeByItemId(itemId);
        this.subRecipes.update(r => ({ ...r, [itemId]: recipe }));

        if (recipe) {
          const subIds = recipe.ingredients.map(i => i.item_id);
          await this.priceService.loadPricesForItems(subIds);
        }
      }
    }
  }

  clearSelection(): void {
    this.selectedItem.set(null);
    this.selectedRecipe.set(null);
    this.searchResults.set([]);
    this.craftModeIngredients.set(new Set());
    this.subRecipes.set({});
  }
}
