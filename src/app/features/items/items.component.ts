import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemService } from '../../core/services/item.service';
import { PriceService } from '../../core/services/price.service';
import { WakfuItem, Recipe } from '@electron';
import { ProfitabilityComponent } from './profitability/profitability.component';
import { SessionService } from '../../core/services/session.service';
import { PriceHistoryComponent } from './price-history/price-history.component';
import { IngredientRowComponent } from './ingredient-row/ingredient-row.component';
import { RarityColorPipe, RarityLabelPipe } from '../../shared/pipes/rarity.pipe';
import { CopyBtnComponent } from '../../shared/components/copy-btn.component';

@Component({
  selector: 'app-items',
  imports: [DecimalPipe, DatePipe, FormsModule, ProfitabilityComponent, PriceHistoryComponent, IngredientRowComponent, RarityColorPipe, RarityLabelPipe, CopyBtnComponent],
  templateUrl: './items.component.html',
  styleUrl: './items.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemsComponent {
  protected readonly itemService    = inject(ItemService);
  protected readonly priceService   = inject(PriceService);
  protected readonly sessionService = inject(SessionService);

  searchQuery = '';
  protected readonly filterOpen      = signal(false);
  protected readonly collapsedTypeIds = signal<Set<number>>(new Set());

  protected readonly visibleTypeList = computed(() => {
    const collapsed = this.collapsedTypeIds();
    return this.itemService.typeList().filter(e => e.parentIds.every(id => !collapsed.has(id)));
  });

  constructor() {
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

  protected readonly craftSubItems = computed(() => {
    const recipe   = this.itemService.selectedRecipe();
    const craftIds = this.itemService.craftModeIngredients();
    const subRecs  = this.itemService.subRecipes();
    if (!recipe) return [];

    const result: typeof recipe.ingredients = [];
    const visited = new Set<number>();

    const collect = (ingredients: typeof recipe.ingredients) => {
      for (const ing of ingredients) {
        if (!craftIds.has(ing.item_id) || visited.has(ing.item_id)) continue;
        visited.add(ing.item_id);
        const sub = subRecs[ing.item_id];
        if (sub) collect(sub.ingredients);
        result.push(ing);
      }
    };

    collect(recipe.ingredients);
    return result;
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

  async onConfirmAdd(): Promise<void> {
    const item = this.itemService.selectedItem();
    if (!item) return;

    const qty      = this.addDialogQuantity();
    const recipe   = this.itemService.selectedRecipe();
    const craftIds = this.itemService.craftModeIngredients();
    const subRecs  = this.itemService.subRecipes();

    if (this.sessionService.sessions().length === 0) {
      await this.sessionService.createSession('Ma session');
    }
    await this.sessionService.loadSessions();

    await this.addItemRecursive(item.id, qty, craftIds, recipe, subRecs, new Set(), null);
    await this.sessionService.refreshData();

    this.addDialogVisible.set(false);
  }

  private async addItemRecursive(
    itemId:              number,
    quantity:            number,
    craftIds:            Set<number>,
    recipe:              Recipe | null,
    subRecs:             Partial<Record<number, Recipe | null>>,
    visited:             Set<number>,
    parentSessionItemId: number | null,
  ): Promise<void> {
    const sessionItemId = await this.sessionService.addItem(itemId, quantity, parentSessionItemId);

    if (!recipe) return;

    for (const ing of recipe.ingredients) {
      if (!craftIds.has(ing.item_id) || visited.has(ing.item_id)) continue;
      visited.add(ing.item_id);
      await this.addItemRecursive(
        ing.item_id,
        ing.quantity * quantity,
        craftIds,
        subRecs[ing.item_id] ?? null,
        subRecs,
        visited,
        sessionItemId,
      );
    }
  }
}
