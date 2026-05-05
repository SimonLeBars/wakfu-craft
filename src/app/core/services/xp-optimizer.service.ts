import { Injectable, computed, inject, signal } from '@angular/core';
import { PriceEntry, XpRecipe } from '@electron';
import { ProfessionProfileService } from './profession-profile.service';
import { SessionService } from './session.service';
import {
  SortMode, XpRow, SubCraftItem, BlockedCraft,
  buildXpRow, collectSubCrafts, collectBlockedCrafts, wouldCraft, resolveIngredientsCost,
} from './xp-optimizer.utils';

export type { SortMode, XpRow, SubCraftItem, BlockedCraft };

@Injectable({ providedIn: 'root' })
export class XpOptimizerService {
  private readonly profile        = inject(ProfessionProfileService);
  private readonly sessionService = inject(SessionService);

  readonly selectedCatId       = signal<number | null>(null);
  readonly playerLevel         = signal<number>(100);
  readonly sortMode            = signal<SortMode>('xp-per-cost');
  readonly recipes             = signal<XpRecipe[]>([]);
  readonly subRecipeMap        = signal<Map<number, XpRecipe>>(new Map());
  readonly availableSubRecipes = signal<Map<number, XpRecipe[]>>(new Map());
  readonly prices              = signal<Record<number, PriceEntry>>({});
  readonly isLoading           = signal(false);

  readonly dialogRow            = signal<XpRow | null>(null);
  readonly dialogQty            = signal<number>(1);
  readonly dialogCheckedBlocked = signal<Set<number>>(new Set());

  readonly craftCategories = computed(() => this.profile.categories().filter(c => !c.is_innate));

  readonly dialogSubCrafts = computed((): SubCraftItem[] => {
    const row = this.dialogRow();
    if (!row) return [];
    return collectSubCrafts(row.ingredients, this.subRecipeMap(), this.prices(), this.profile.levels(), Date.now(), new Set());
  });

  readonly dialogBlockedCrafts = computed((): BlockedCraft[] => {
    const row = this.dialogRow();
    if (!row) return [];
    return collectBlockedCrafts(row.ingredients, this.subRecipeMap(), this.prices(), this.profile.levels(), Date.now(), new Set());
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
      const { selected, available } = await this.buildSubRecipeMap(recipes);
      this.subRecipeMap.set(selected);
      this.availableSubRecipes.set(available);
      await this.loadPrices(recipes, selected);
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
    this.dialogCheckedBlocked.set(new Set());
  }

  toggleBlockedCraft(itemId: number): void {
    this.dialogCheckedBlocked.update(s => {
      const next = new Set(s);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
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
                                recipeMap, prices, profLevels, now, new Set(), null, row.recipe_id,
                                this.dialogCheckedBlocked());
    await this.sessionService.refreshData();
    this.closeDialog();
  }

  private async addItemRecursive(
    itemId:        number,
    qty:           number,
    ingredients:   { item_id: number; quantity: number }[],
    recipeMap:     Map<number, XpRecipe>,
    prices:        Record<number, PriceEntry>,
    profLevels:    Record<number, number>,
    now:           number,
    visited:       Set<number>,
    parentId:      number | null,
    recipeId:      number | null = null,
    forceCraftIds: Set<number>   = new Set(),
  ): Promise<void> {
    const sessionItemId = await this.sessionService.addItem(itemId, qty, parentId, recipeId);

    for (const ing of ingredients) {
      const craft = wouldCraft(ing.item_id, recipeMap, prices, profLevels, now, visited)
                 || forceCraftIds.has(ing.item_id);
      if (!craft) continue;
      const subRecipe   = recipeMap.get(ing.item_id)!;
      const nextVisited = new Set(visited).add(ing.item_id);
      await this.addItemRecursive(
        ing.item_id, ing.quantity * qty, subRecipe.ingredients,
        recipeMap, prices, profLevels, now, nextVisited, sessionItemId, subRecipe.recipe_id,
        forceCraftIds,
      );
    }
  }

  selectSubRecipe(itemId: number, recipe: XpRecipe): void {
    this.subRecipeMap.update(m => new Map(m).set(itemId, recipe));
  }

  private async buildSubRecipeMap(recipes: XpRecipe[]): Promise<{ selected: Map<number, XpRecipe>; available: Map<number, XpRecipe[]> }> {
    const selected  = new Map<number, XpRecipe>();
    const available = new Map<number, XpRecipe[]>();
    const done      = new Set<number>();
    const pending   = new Set(recipes.flatMap(r => r.ingredients.map(i => i.item_id)));

    while (pending.size > 0) {
      const ids = [...pending].filter(id => !done.has(id));
      if (ids.length === 0) break;
      const subRecipes = await window.electronAPI.getRecipesByItemIds(ids);
      for (const sr of subRecipes) {
        if (!available.has(sr.item_id)) {
          available.set(sr.item_id, []);
          selected.set(sr.item_id, sr);
          sr.ingredients.forEach(i => { if (!done.has(i.item_id)) pending.add(i.item_id); });
        }
        available.get(sr.item_id)!.push(sr);
      }
      ids.forEach(id => { done.add(id); pending.delete(id); });
    }
    return { selected, available };
  }

  private async loadPrices(recipes: XpRecipe[], subMap: Map<number, XpRecipe>): Promise<void> {
    const allIds = new Set<number>();
    for (const r of [...recipes, ...subMap.values()]) {
      allIds.add(r.item_id);
      r.ingredients.forEach(i => allIds.add(i.item_id));
    }
    // Inclure aussi les ingrédients des recettes alternatives non sélectionnées
    for (const alternatives of this.availableSubRecipes().values()) {
      for (const r of alternatives) r.ingredients.forEach(i => allIds.add(i.item_id));
    }
    if (allIds.size > 0) {
      this.prices.set(await window.electronAPI.getLatestPriceEntries([...allIds]));
    }
    this.selectCheapestSubRecipes();
  }

  private selectCheapestSubRecipes(): void {
    const prices     = this.prices();
    const profLevels = this.profile.levels();
    const now        = Date.now();
    const currentMap = this.subRecipeMap();
    const updated    = new Map(currentMap);

    for (const [itemId, recipes] of this.availableSubRecipes()) {
      if (recipes.length <= 1) continue;
      let bestRecipe = recipes[0];
      let bestCost   = Infinity;
      for (const r of recipes) {
        const { cost } = resolveIngredientsCost(r.ingredients, currentMap, prices, profLevels, now);
        const perUnit  = cost !== null ? cost / r.result_quantity : Infinity;
        if (perUnit < bestCost) { bestCost = perUnit; bestRecipe = r; }
      }
      updated.set(itemId, bestRecipe);
    }
    this.subRecipeMap.set(updated);
  }
}
