import { Injectable, computed, inject, signal } from '@angular/core';
import { PriceEntry, XpRecipe } from '@electron';
import { ProfessionProfileService } from './profession-profile.service';
import { SessionService } from './session.service';
import { ItemService } from './item.service';
import {
  SortMode, XpRow, SubCraftItem, BlockedCraft, ScanGroup,
  buildXpRow, collectSubCrafts, collectBlockedCrafts, wouldCraft, resolveIngredientsCost, buildScanGroups,
} from './xp-optimizer.utils';

export type { SortMode, XpRow, SubCraftItem, BlockedCraft, ScanGroup };

@Injectable({ providedIn: 'root' })
export class XpOptimizerService {
  private readonly profile        = inject(ProfessionProfileService);
  private readonly sessionService = inject(SessionService);
  readonly itemService            = inject(ItemService);

  readonly selectedCatId       = signal<number | null>(null);
  readonly playerLevel         = signal<number>(100);
  readonly sortMode            = signal<SortMode>('xp-per-cost');
  readonly recipes             = signal<XpRecipe[]>([]);
  readonly subRecipeMap        = signal<Map<number, XpRecipe>>(new Map());
  readonly availableSubRecipes = signal<Map<number, XpRecipe[]>>(new Map());
  readonly prices              = signal<Record<number, PriceEntry>>({});
  readonly isLoading           = signal(false);

  readonly searchQuery          = signal('');

  readonly dialogRow            = signal<XpRow | null>(null);
  readonly dialogQty            = signal<number>(1);
  readonly dialogCheckedBlocked = signal<Set<number>>(new Set());

  readonly craftCategories = computed(() => this.profile.categories().filter(c => !c.is_innate));

  readonly scanGroups = computed((): ScanGroup[] => {
    const groups    = buildScanGroups(this.rows(), this.subRecipeMap(), this.availableSubRecipes(), this.prices(), Date.now());
    const typeNames = new Map(this.itemService.itemTypes().map(t => [t.id, t.name['fr'] ?? '']));
    return groups.sort((a, b) => {
      const na = typeNames.get(a.type_id) ?? '';
      const nb = typeNames.get(b.type_id) ?? '';
      const c  = na.localeCompare(nb, 'fr');
      return c !== 0 ? c : a.bracket_min - b.bracket_min;
    });
  });

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

  async onLevelChange(level: number): Promise<void> {
    this.playerLevel.set(level);
    const id = this.selectedCatId();
    if (!id) return;

    this.isLoading.set(true);
    try {
      await this.loadCategoryRecipes(id, level);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onCategoryChange(id: number | null): Promise<void> {
    this.selectedCatId.set(id);
    this.searchQuery.set('');
    this.recipes.set([]);
    this.subRecipeMap.set(new Map());
    this.availableSubRecipes.set(new Map());
    this.prices.set({});
    if (!id) return;

    if (this.itemService.itemTypes().length === 0) await this.itemService.loadItemTypes();
    this.playerLevel.set(this.profile.getLevel(id));
    this.isLoading.set(true);
    try {
      await this.loadCategoryRecipes(id, this.playerLevel());
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadCategoryRecipes(categoryId: number, playerLevel: number): Promise<void> {
    const recipes = await window.electronAPI.getRecipesByCategoryAndLevel(
      categoryId, playerLevel - 19, playerLevel + 9,
    );
    this.recipes.set(recipes);

    const { selected, available } = await this.buildSubRecipeMap(recipes);
    this.subRecipeMap.set(selected);
    this.availableSubRecipes.set(available);

    await this.loadPrices(recipes, selected, available);
    this.selectCheapestSubRecipes();
  }

  async refreshPrices(): Promise<void> {
    if (this.recipes().length === 0) return;
    await this.loadPrices(this.recipes(), this.subRecipeMap(), this.availableSubRecipes());
    this.selectCheapestSubRecipes();
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

    const subRecipes = this.buildSubRecipesMap(
      row.ingredients, recipeMap, prices, profLevels, now, new Set(), this.dialogCheckedBlocked(),
    );
    await this.sessionService.addItem(row.item_id, this.dialogQty(), row.recipe_id, subRecipes);
    await this.sessionService.refreshData();
    this.closeDialog();
  }

  private buildSubRecipesMap(
    ingredients:   { item_id: number; quantity: number }[],
    recipeMap:     Map<number, XpRecipe>,
    prices:        Record<number, PriceEntry>,
    profLevels:    Record<number, number>,
    now:           number,
    visited:       Set<number>,
    forceCraftIds: Set<number>,
  ): Record<number, number> {
    const result: Record<number, number> = {};
    for (const ing of ingredients) {
      const craft = wouldCraft(ing.item_id, recipeMap, prices, profLevels, now, visited)
                 || forceCraftIds.has(ing.item_id);
      if (!craft) continue;
      const subRecipe = recipeMap.get(ing.item_id);
      if (!subRecipe) continue;
      result[ing.item_id] = subRecipe.recipe_id;
      const nested = this.buildSubRecipesMap(
        subRecipe.ingredients, recipeMap, prices, profLevels, now,
        new Set(visited).add(ing.item_id), forceCraftIds,
      );
      Object.assign(result, nested);
    }
    return result;
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

  private async loadPrices(recipes: XpRecipe[], subMap: Map<number, XpRecipe>, available: Map<number, XpRecipe[]>): Promise<void> {
    const allIds = new Set<number>();
    for (const r of [...recipes, ...subMap.values()]) {
      allIds.add(r.item_id);
      r.ingredients.forEach(i => allIds.add(i.item_id));
    }
    for (const alternatives of available.values()) {
      for (const r of alternatives) r.ingredients.forEach(i => allIds.add(i.item_id));
    }
    if (allIds.size > 0) {
      this.prices.set(await window.electronAPI.getLatestPriceEntries([...allIds]));
    }
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
