import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ItemService } from '@services/item.service';
import { PriceService } from '@services/price.service';
import { WakfuItem, Recipe } from '@electron';
import { ProfitabilityComponent } from './profitability/profitability.component';
import { SessionService } from '@services/session.service';
import { PriceHistoryComponent } from './price-history/price-history.component';
import { IngredientRowComponent } from './ingredient-row/ingredient-row.component';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';

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
  protected readonly filterOpen       = signal(false);
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
