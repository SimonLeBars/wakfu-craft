import { Injectable, signal, inject, computed } from '@angular/core';
import { PriceService } from './price.service';
import { Recipe, WakfuItem, ItemType } from '@electron';

export interface ItemTypeNode {
  id:       number;
  name:     Record<string, string>;
  children: ItemTypeNode[];
}

export interface TypeListEntry {
  node:        ItemTypeNode;
  depth:       number;
  parentIds:   number[];
  hasChildren: boolean;
}

@Injectable({ providedIn: 'root' })
export class ItemService {
  private priceService = inject(PriceService);

  readonly searchResults        = signal<WakfuItem[]>([]);
  readonly selectedItem         = signal<WakfuItem | null>(null);
  readonly availableRecipes     = signal<Recipe[]>([]);
  readonly selectedRecipe       = signal<Recipe | null>(null);
  readonly isLoading            = signal(false);
  readonly craftModeIngredients = signal<Set<number>>(new Set());
  readonly subRecipes           = signal<Partial<Record<number, Recipe | null>>>({});
  readonly availableSubRecipes  = signal<Partial<Record<number, Recipe[]>>>({});
  readonly itemTypes            = signal<ItemType[]>([]);
  readonly selectedTypeIds      = signal<Set<number>>(new Set());
  readonly minLevel             = signal<number | null>(null);
  readonly maxLevel             = signal<number | null>(null);
  readonly selectedRarities     = signal<Set<number>>(new Set());

  readonly RARITIES = [
    { value: 0, label: 'Commun',     color: '#6b7280' },
    { value: 2, label: 'Rare',       color: '#4ade80' },
    { value: 3, label: 'Mythique',   color: '#f97316' },
    { value: 4, label: 'Légendaire', color: '#facc15' },
    { value: 5, label: 'Relique',    color: '#a855f7' },
    { value: 6, label: 'Épique',     color: '#f472b6' },
  ] as const;

  readonly typeTree = computed<ItemTypeNode[]>(() => {
    const types = this.itemTypes();
    const map = new Map<number, ItemTypeNode>();
    for (const t of types) map.set(t.id, { id: t.id, name: t.name, children: [] });
    const roots: ItemTypeNode[] = [];
    for (const t of types) {
      const node = map.get(t.id)!;
      if (t.parent_id !== null && map.has(t.parent_id)) map.get(t.parent_id)!.children.push(node);
      else roots.push(node);
    }
    return roots;
  });

  readonly typeList = computed<TypeListEntry[]>(() => {
    const flatten = (nodes: ItemTypeNode[], depth: number, parentIds: number[]): TypeListEntry[] =>
      nodes.flatMap(node => [
        { node, depth, parentIds, hasChildren: node.children.length > 0 },
        ...flatten(node.children, depth + 1, [...parentIds, node.id]),
      ]);
    return flatten(this.typeTree(), 0, []);
  });

  // Computed map: typeId → node itself + all descendant IDs at every level
  private readonly subtreeIdsMap = computed(() => {
    const types = this.itemTypes();
    const map = new Map<number, number[]>();
    const getSubtree = (id: number): number[] => {
      if (map.has(id)) return map.get(id)!;
      const children = types.filter(t => t.parent_id === id);
      const result = [id, ...children.flatMap(c => getSubtree(c.id))];
      map.set(id, result);
      return result;
    };
    for (const t of types) getSubtree(t.id);
    return map;
  });

  async loadItemTypes(): Promise<void> {
    const types = await window.electronAPI.getItemTypes();
    this.itemTypes.set(types);
  }

  async search(query: string): Promise<void> {
    this.isLoading.set(true);
    try {
      const typeIds = [...this.selectedTypeIds()];
      const results = await window.electronAPI.searchItems(
        query, 'fr',
        typeIds.length ? typeIds : undefined,
        this.minLevel() ?? undefined,
        this.maxLevel() ?? undefined,
        this.selectedRarities().size ? [...this.selectedRarities()] : undefined,
      );
      this.searchResults.set(results);
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleType(typeId: number): void {
    const ids = this.subtreeIdsMap().get(typeId) ?? [typeId];
    const current = this.selectedTypeIds();
    const allSelected = ids.every(id => current.has(id));
    const next = new Set(current);
    if (allSelected) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    this.selectedTypeIds.set(next);
  }

  clearTypeFilter(): void {
    this.selectedTypeIds.set(new Set());
  }

  clearLevelFilter(): void {
    this.minLevel.set(null);
    this.maxLevel.set(null);
  }

  toggleRarity(value: number): void {
    const next = new Set(this.selectedRarities());
    if (next.has(value)) next.delete(value);
    else next.add(value);
    this.selectedRarities.set(next);
  }

  isTypeSelected(typeId: number): boolean {
    const ids = this.subtreeIdsMap().get(typeId) ?? [typeId];
    const selected = this.selectedTypeIds();
    return ids.length > 0 && ids.every(id => selected.has(id));
  }

  isTypeIndeterminate(typeId: number): boolean {
    const ids = this.subtreeIdsMap().get(typeId) ?? [typeId];
    const selected = this.selectedTypeIds();
    const count = ids.filter(id => selected.has(id)).length;
    return count > 0 && count < ids.length;
  }

  async selectItem(item: WakfuItem): Promise<void> {
    this.selectedItem.set(item);
    this.availableRecipes.set([]);
    this.selectedRecipe.set(null);
    this.craftModeIngredients.set(new Set());
    this.subRecipes.set({});
    this.availableSubRecipes.set({});

    const recipes = await window.electronAPI.getRecipesByItemId(item.id);
    this.availableRecipes.set(recipes);
    const recipe = recipes[0] ?? null;
    this.selectedRecipe.set(recipe);

    if (recipe) {
      await this.priceService.loadPricesForItems([item.id, ...recipe.ingredients.map(i => i.item_id)]);
      await this.loadAllSubRecipes(recipe.ingredients);
    }
  }

  async selectRecipe(recipe: Recipe): Promise<void> {
    this.selectedRecipe.set(recipe);
    await this.priceService.loadPricesForItems([this.selectedItem()!.id, ...recipe.ingredients.map(i => i.item_id)]);
    await this.loadAllSubRecipes(recipe.ingredients);
  }

  async toggleCraftMode(itemId: number): Promise<void> {
    const next = new Set(this.craftModeIngredients());
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
    this.craftModeIngredients.set(next);
  }

  private async loadAllSubRecipes(rootIngredients: Recipe['ingredients']): Promise<void> {
    const visited = new Set<number>();
    const pending = new Set(rootIngredients.filter(i => i.hasRecipe).map(i => i.item_id));

    while (pending.size > 0) {
      const batch = [...pending].filter(id => !visited.has(id));
      if (batch.length === 0) break;
      batch.forEach(id => { visited.add(id); pending.delete(id); });

      const results = await Promise.all(
        batch.map(id => window.electronAPI.getRecipesByItemId(id).then(recipes => ({ id, recipes })))
      );

      const newAvailable: Partial<Record<number, Recipe[]>>      = {};
      const newSubRecipes: Partial<Record<number, Recipe | null>> = {};
      const newPriceIds: number[] = [];

      for (const { id, recipes } of results) {
        newAvailable[id]  = recipes;
        newSubRecipes[id] = recipes[0] ?? null;
        for (const r of recipes) {
          for (const ing of r.ingredients) {
            newPriceIds.push(ing.item_id);
            if (ing.hasRecipe && !visited.has(ing.item_id)) pending.add(ing.item_id);
          }
        }
      }

      this.availableSubRecipes.update(r => ({ ...r, ...newAvailable }));
      this.subRecipes.update(r => ({ ...r, ...newSubRecipes }));
      if (newPriceIds.length > 0) await this.priceService.loadPricesForItems(newPriceIds);
    }
  }

  async selectSubRecipe(itemId: number, recipe: Recipe): Promise<void> {
    this.subRecipes.update(r => ({ ...r, [itemId]: recipe }));
    await this.priceService.loadPricesForItems(recipe.ingredients.map(i => i.item_id));
  }
}
