import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionService } from '@services/session.service';
import { PriceService } from '@services/price.service';
import { ProfessionProfileService } from '@services/profession-profile.service';
import { CraftSession, RecipeTreeNode, XpRecipe } from '@electron';
import { computeEffectiveXp } from '@services/xp-optimizer.utils';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';

@Component({
  selector: 'app-session',
  imports: [DecimalPipe, FormsModule, RarityColorPipe, RarityLabelPipe, CopyBtnComponent],
  templateUrl: './session.component.html',
  styleUrl: './session.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionComponent implements OnInit {
  protected readonly sessionService = inject(SessionService);
  protected readonly priceService   = inject(PriceService);
  private   readonly profile        = inject(ProfessionProfileService);

  private readonly xpRecipes = signal<XpRecipe[]>([]);

  protected readonly newSessionName = signal('');
  protected readonly showNewSession = signal(false);

  protected readonly renamingId  = signal<number | null>(null);
  protected readonly renameValue = signal('');

  protected readonly hoveredItemId = signal<number | null>(null);
  protected readonly tooltipPos   = signal<{ x: number; y: number } | null>(null);

  protected readonly hoveredNode = computed(() =>
    this.sessionService.sessionItems().find(i => i.session_item_id === this.hoveredItemId()) ?? null
  );

  protected readonly hoveredSubCrafts = computed(() => {
    const item = this.hoveredNode();
    if (!item) return [];
    const result: { name: string; qty: number; depth: number }[] = [];
    const visit = (n: RecipeTreeNode, depth: number) => {
      for (const child of n.children) {
        result.push({ name: child.item_name['fr'], qty: child.craft_quantity, depth });
        visit(child, depth + 1);
      }
    };
    visit(item, 0);
    return result;
  });

  protected readonly totalCost = computed(() =>
    this.sessionService.shoppingList().reduce((sum, item) => {
      const price = this.priceService.getPrice(item.item_id) ?? 0;
      return sum + price * item.total_quantity;
    }, 0)
  );

  protected readonly totalSellPrice = computed(() =>
    this.sessionService.sessionItems().reduce((sum, item) => {
      const price = this.priceService.getPrice(item.item_id) ?? 0;
      return sum + price * item.craft_quantity * item.result_quantity;
    }, 0)
  );

  protected readonly grossMargin = computed(() => this.totalSellPrice() - this.totalCost());

  protected readonly marginPercent = computed(() => {
    const cost = this.totalCost();
    return cost > 0 ? (this.grossMargin() / cost) * 100 : 0;
  });

  protected readonly missingCounts = computed(() => ({
    ingredients: this.sessionService.shoppingList().filter(i => !this.priceService.getPrice(i.item_id)).length,
    sell:        this.sessionService.sessionItems().filter(i => !this.priceService.getPrice(i.item_id)).length,
  }));

  protected readonly totalExpectedXp = computed(() => {
    const recipeMap = new Map(this.xpRecipes().map(r => [r.item_id, r]));
    const levels    = this.profile.levels();
    return this.sessionService.sessionItems().reduce((sum, item) => {
      const recipe = recipeMap.get(item.item_id);
      if (!recipe) return sum;
      const gap = recipe.recipe_level - (levels[recipe.category_id] ?? 1);
      return sum + computeEffectiveXp(recipe.xp_ratio, gap) * item.craft_quantity;
    }, 0);
  });

  async ngOnInit(): Promise<void> {
    await this.sessionService.loadSessions();
    await Promise.all([this.loadPrices(), this.loadXpRecipes(), this.profile.load()]);
  }

  async onSelectSession(session: CraftSession): Promise<void> {
    await this.sessionService.selectSession(session);
    await this.loadXpRecipes();
  }

  protected formatXp(val: number): string {
    if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + ' M';
    if (val >= 1_000)     return (val / 1_000).toFixed(1) + ' K';
    return val.toFixed(0);
  }

  async onCreateSession(): Promise<void> {
    if (!this.newSessionName().trim()) return;
    await this.sessionService.createSession(this.newSessionName().trim());
    this.newSessionName.set('');
    this.showNewSession.set(false);
    await this.loadPrices();
  }

  async onRemoveItem(sessionItemId: number): Promise<void> {
    await this.sessionService.removeItem(sessionItemId);
    await this.loadPrices();
  }

  async onUpdateQty(sessionItemId: number, value: string): Promise<void> {
    const qty = parseInt(value, 10);
    if (!isNaN(qty)) {
      await this.sessionService.updateQty(sessionItemId, qty);
      await this.loadPrices();
    }
  }

  onStartRename(session: CraftSession, event: Event): void {
    event.stopPropagation();
    this.renamingId.set(session.id);
    this.renameValue.set(session.name);
  }

  async onConfirmRename(): Promise<void> {
    const id   = this.renamingId();
    const name = this.renameValue().trim();
    if (id !== null && name) {
      await this.sessionService.renameSession(id, name);
    }
    this.renamingId.set(null);
  }

  protected showCraftTooltip(item: RecipeTreeNode, event: Event): void {
    if (item.children.length === 0) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.hoveredItemId.set(item.session_item_id);
    this.tooltipPos.set({ x: rect.right + 8, y: rect.top });
  }

  protected hideCraftTooltip(): void {
    this.hoveredItemId.set(null);
    this.tooltipPos.set(null);
  }

  onCancelRename(event?: Event): void {
    event?.stopPropagation();
    this.renamingId.set(null);
  }

  private async loadXpRecipes(): Promise<void> {
    const itemIds = this.sessionService.sessionItems().map(i => i.item_id);
    if (itemIds.length === 0) { this.xpRecipes.set([]); return; }
    const recipes = await window.electronAPI.getRecipesByItemIds(itemIds);
    this.xpRecipes.set(recipes);
  }

  private async loadPrices(): Promise<void> {
    const ingredientIds = this.sessionService.shoppingList().map(i => i.item_id);
    const sessionItemIds = this.sessionService.sessionItems().map(i => i.item_id);
    const ids = [...new Set([...ingredientIds, ...sessionItemIds])];
    if (ids.length > 0) await this.priceService.loadPricesForItems(ids);
  }
}
