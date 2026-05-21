import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe, DatePipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemService } from '@services/item.service';
import { PriceService } from '@services/price.service';
import { ProfessionProfileService } from '@services/profession-profile.service';
import { WakfuItem, Recipe } from '@electron';
import { ProfitabilityComponent } from './profitability/profitability.component';
import { SessionService } from '@services/session.service';
import { PriceHistoryComponent } from './price-history/price-history.component';
import { IngredientRowComponent } from './ingredient-row/ingredient-row.component';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';
import { craftSuccessRate, craftCurrentXp } from '@services/xp-optimizer.utils';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface ItemScanEntry {
  item_id:    number;
  item_name:  Record<string, string>;
  item_level: number;
}

interface ItemScanGroup {
  type_name: string;
  missing:   ItemScanEntry[];
  stale:     ItemScanEntry[];
}

function collectRecipeIngredients(
  ingredients:      Recipe['ingredients'],
  availableSubRecs: Partial<Record<number, Recipe[]>>,
  visited:          Set<number> = new Set(),
): Recipe['ingredients'] {
  const result: Recipe['ingredients'] = [];
  for (const ing of ingredients) {
    if (visited.has(ing.item_id)) continue;
    result.push(ing);
    const alts = availableSubRecs[ing.item_id];
    if (alts?.length) {
      for (const alt of alts) {
        result.push(...collectRecipeIngredients(alt.ingredients, availableSubRecs, new Set(visited).add(ing.item_id)));
      }
    }
  }
  return result;
}

function collectCraftSubItems(
  ingredients: Recipe['ingredients'],
  craftIds:    Set<number>,
  subRecs:     Partial<Record<number, Recipe | null>>,
  visited      = new Set<number>(),
): Recipe['ingredients'] {
  const result: Recipe['ingredients'] = [];
  for (const ing of ingredients) {
    if (!craftIds.has(ing.item_id) || visited.has(ing.item_id)) continue;
    visited.add(ing.item_id);
    const sub = subRecs[ing.item_id];
    if (sub) result.push(...collectCraftSubItems(sub.ingredients, craftIds, subRecs, visited));
    result.push(ing);
  }
  return result;
}

@Component({
  selector: 'app-items',
  imports: [DecimalPipe, DatePipe, PercentPipe, FormsModule, ProfitabilityComponent, PriceHistoryComponent, IngredientRowComponent, RarityColorPipe, RarityLabelPipe, CopyBtnComponent],
  templateUrl: './items.component.html',
  styleUrl: './items.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemsComponent {
  protected readonly itemService    = inject(ItemService);
  protected readonly priceService   = inject(PriceService);
  protected readonly sessionService = inject(SessionService);
  protected readonly profile        = inject(ProfessionProfileService);

  searchQuery = '';
  protected readonly filterOpen       = signal(false);
  protected readonly collapsedTypeIds = signal<Set<number>>(new Set());

  protected readonly visibleTypeList = computed(() => {
    const collapsed = this.collapsedTypeIds();
    return this.itemService.typeList().filter(e => e.parentIds.every(id => !collapsed.has(id)));
  });

  constructor() {
    this.profile.load();
    this.itemService.search('');
    this.itemService.loadItemTypes().then(() => {
      this.collapsedTypeIds.set(
        new Set(this.itemService.typeList().filter(e => e.hasChildren).map(e => e.node.id)),
      );
    });
  }

  protected toggleCollapse(typeId: number): void {
    const next = new Set(this.collapsedTypeIds());
    if (next.has(typeId)) next.delete(typeId);
    else next.add(typeId);
    this.collapsedTypeIds.set(next);
  }

  // ── Dialog d'ajout à la session ────────────────────────────────────────────
  protected readonly addDialogVisible  = signal(false);
  protected readonly addDialogQuantity = signal(1);

  protected readonly recipeScanGroups = computed((): ItemScanGroup[] => {
    const recipe = this.itemService.selectedRecipe();
    const item   = this.itemService.selectedItem();
    if (!recipe || !item) return [];

    const availableSubRecs = this.itemService.availableSubRecipes();
    const dates            = this.priceService.priceDates();
    const nfs              = this.priceService.notForSale();
    const typeNames        = new Map(this.itemService.itemTypes().map(t => [t.id, t.name['fr'] ?? '']));
    const now              = Date.now();

    const groupMap = new Map<number, ItemScanGroup>();
    const seen     = new Set<number>();
    const getGroup = (typeId: number): ItemScanGroup => {
      if (!groupMap.has(typeId)) {
        groupMap.set(typeId, { type_name: typeNames.get(typeId) ?? `Type ${typeId}`, missing: [], stale: [] });
      }
      return groupMap.get(typeId)!;
    };
    const check = (id: number, name: Record<string, string>, level: number, typeId: number): void => {
      if (seen.has(id)) return;
      seen.add(id);
      const dateStr = dates[id];
      const isNfs   = nfs[id];
      const entry   = { item_id: id, item_name: name, item_level: level };
      if (!dateStr) getGroup(typeId).missing.push(entry);
      else if (!isNfs && now - new Date(dateStr).getTime() > ONE_DAY_MS) getGroup(typeId).stale.push(entry);
    };

    check(item.id, item.name, item.level, item.type);
    for (const ing of collectRecipeIngredients(recipe.ingredients, availableSubRecs)) {
      check(ing.item_id, ing.item_name, ing.item_level, ing.item_type);
    }

    return [...groupMap.values()]
      .sort((a, b) => a.type_name.localeCompare(b.type_name, 'fr'))
      .map(g => ({
        ...g,
        missing: [...g.missing].sort((a, b) => a.item_level - b.item_level),
        stale:   [...g.stale].sort((a, b) => a.item_level - b.item_level),
      }));
  });

  protected readonly craftSubItems = computed(() => {
    const recipe = this.itemService.selectedRecipe();
    if (!recipe) return [];
    return collectCraftSubItems(
      recipe.ingredients,
      this.itemService.craftModeIngredients(),
      this.itemService.subRecipes(),
    );
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  onSearch(): void {
    this.itemService.search(this.searchQuery);
  }

  onSelectItem(item: WakfuItem): void {
    this.itemService.selectItem(item);
  }

  async onSetSellPrice(value: string): Promise<void> {
    const item = this.itemService.selectedItem();
    if (!item) return;
    const price = parseFloat(value);
    if (!isNaN(price) && price >= 0) {
      await this.priceService.setPrice(item.id, price);
    }
  }

  async onSetSellNotForSale(): Promise<void> {
    const item = this.itemService.selectedItem();
    if (!item) return;
    await this.priceService.setNotForSale(item.id);
  }

  onOpenAddDialog(): void {
    this.addDialogQuantity.set(1);
    this.addDialogVisible.set(true);
  }

  onCancelDialog(): void {
    this.addDialogVisible.set(false);
  }

  protected readonly xpInfo = computed(() => {
    const recipe = this.itemService.selectedRecipe();
    if (!recipe) return null;
    const gap  = recipe.level - (this.profile.levels()[recipe.category_id] ?? 0);
    const xp   = craftCurrentXp(recipe.xp_ratio, gap, this.profile.guildXpBonus());
    const rate = craftSuccessRate(gap);
    return { xp, rate };
  });

  protected hasEnoughLevel(recipe: Recipe): boolean {
    return (this.profile.levels()[recipe.category_id] ?? 0) >= recipe.level;
  }

  async onConfirmAdd(): Promise<void> {
    const item = this.itemService.selectedItem();
    if (!item) return;

    if (this.sessionService.sessions().length === 0) {
      await this.sessionService.createSession('Ma session');
    }
    await this.sessionService.loadSessions();

    await this.sessionService.addItemTree(
      item.id,
      this.addDialogQuantity(),
      this.itemService.craftModeIngredients(),
      this.itemService.selectedRecipe(),
      this.itemService.subRecipes(),
    );
    await this.sessionService.refreshData();

    this.addDialogVisible.set(false);
  }
}
