import { Injectable, computed, inject, signal } from '@angular/core';
import { PriceEntry, XpRecipe } from '@electron';
import { ProfessionProfileService } from './profession-profile.service';
import { SessionService } from './session.service';
import {
  SortMode, XpRow, SubCraftItem,
  buildXpRow, collectSubCrafts, wouldCraft,
} from './xp-optimizer.utils';

export type { SortMode, XpRow, SubCraftItem };

@Injectable({ providedIn: 'root' })
export class XpOptimizerService {
  private readonly profile        = inject(ProfessionProfileService);
  private readonly sessionService = inject(SessionService);

  readonly selectedCatId = signal<number | null>(null);
  readonly playerLevel   = signal<number>(100);
  readonly sortMode      = signal<SortMode>('xp-per-cost');
  readonly recipes       = signal<XpRecipe[]>([]);
  readonly subRecipeMap  = signal<Map<number, XpRecipe>>(new Map());
  readonly prices        = signal<Record<number, PriceEntry>>({});
  readonly isLoading     = signal(false);

  readonly dialogRow = signal<XpRow | null>(null);
  readonly dialogQty = signal<number>(1);

  readonly craftCategories = computed(() => this.profile.categories().filter(c => !c.is_innate));

  readonly dialogSubCrafts = computed((): SubCraftItem[] => {
    const row = this.dialogRow();
    if (!row) return [];
    return collectSubCrafts(row.ingredients, this.subRecipeMap(), this.prices(), this.profile.levels(), Date.now(), new Set());
  });

  readonly rows = computed((): XpRow[] => {
    const prices      = this.prices();
    const playerLevel = this.playerLevel();
    const sortMode    = this.sortMode();
    const recipeMap   = this.subRecipeMap();
    const profLevels  = this.profile.levels();
    const now         = Date.now();

    return this.recipes()
      .map(r => buildXpRow(r, playerLevel, sortMode, recipeMap, prices, profLevels, now))
      .filter(r => r.effectiveXp > 0)
      .sort((a, b) => {
        if (a.score == null && b.score == null) return a.recipe_level - b.recipe_level;
        if (a.score == null) return 1;
        if (b.score == null) return -1;
        return b.score - a.score;
      });
  });

  async onCategoryChange(id: number | null): Promise<void> {
    this.selectedCatId.set(id);
    this.recipes.set([]);
    this.subRecipeMap.set(new Map());
    this.prices.set({});
    if (!id) return;

    this.playerLevel.set(this.profile.getLevel(id));
    this.isLoading.set(true);
    try {
      const recipes = await window.electronAPI.getRecipesByCategory(id);
      this.recipes.set(recipes);
      const subMap  = await this.buildSubRecipeMap(recipes);
      this.subRecipeMap.set(subMap);
      await this.loadPrices(recipes, subMap);
    } finally {
      this.isLoading.set(false);
    }
  }

  async refreshPrices(): Promise<void> {
    if (this.recipes().length === 0) return;
    await this.loadPrices(this.recipes(), this.subRecipeMap());
  }

  openDialog(row: XpRow): void {
    this.dialogQty.set(1);
    this.dialogRow.set(row);
  }

  closeDialog(): void {
    this.dialogRow.set(null);
  }

  async confirmAdd(): Promise<void> {
    const row = this.dialogRow();
    if (!row) return;

    if (this.sessionService.sessions().length === 0) {
      await this.sessionService.createSession('Ma session');
    }
    await this.sessionService.loadSessions();

    const recipeMap  = this.subRecipeMap();
    const prices     = this.prices();
    const profLevels = this.profile.levels();
    const now        = Date.now();

    await this.addItemRecursive(row.item_id, this.dialogQty(), row.ingredients,
                                recipeMap, prices, profLevels, now, new Set(), null);
    await this.sessionService.refreshData();
    this.closeDialog();
  }

  private async addItemRecursive(
    itemId:      number,
    qty:         number,
    ingredients: { item_id: number; quantity: number }[],
    recipeMap:   Map<number, XpRecipe>,
    prices:      Record<number, PriceEntry>,
    profLevels:  Record<number, number>,
    now:         number,
    visited:     Set<number>,
    parentId:    number | null,
  ): Promise<void> {
    const sessionItemId = await this.sessionService.addItem(itemId, qty, parentId);

    for (const ing of ingredients) {
      if (!wouldCraft(ing.item_id, recipeMap, prices, profLevels, now, visited)) continue;
      const subRecipe   = recipeMap.get(ing.item_id)!;
      const nextVisited = new Set(visited).add(ing.item_id);
      await this.addItemRecursive(
        ing.item_id, ing.quantity * qty, subRecipe.ingredients,
        recipeMap, prices, profLevels, now, nextVisited, sessionItemId,
      );
    }
  }

  private async buildSubRecipeMap(recipes: XpRecipe[]): Promise<Map<number, XpRecipe>> {
    const map     = new Map<number, XpRecipe>();
    const done    = new Set<number>();
    const pending = new Set(recipes.flatMap(r => r.ingredients.map(i => i.item_id)));

    while (pending.size > 0) {
      const ids = [...pending].filter(id => !done.has(id));
      if (ids.length === 0) break;
      const subRecipes = await window.electronAPI.getRecipesByItemIds(ids);
      for (const sr of subRecipes) {
        map.set(sr.item_id, sr);
        sr.ingredients.forEach(i => { if (!done.has(i.item_id)) pending.add(i.item_id); });
      }
      ids.forEach(id => { done.add(id); pending.delete(id); });
    }
    return map;
  }

  private async loadPrices(recipes: XpRecipe[], subMap: Map<number, XpRecipe>): Promise<void> {
    const allIds = new Set<number>();
    for (const r of [...recipes, ...subMap.values()]) {
      allIds.add(r.item_id);
      r.ingredients.forEach(i => allIds.add(i.item_id));
    }
    if (allIds.size > 0) {
      this.prices.set(await window.electronAPI.getLatestPriceEntries([...allIds]));
    }
  }
}
