import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { SessionService } from '@services/session.service';
import { RecipeTreeNode } from '@electron';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';

@Component({
  selector: 'app-session-planned-crafts',
  imports: [RarityColorPipe, RarityLabelPipe, CopyBtnComponent],
  templateUrl: './session-planned-crafts.component.html',
  styleUrl: './session-planned-crafts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionPlannedCraftsComponent {
  protected readonly sessionService = inject(SessionService);

  protected readonly hoveredItemId = signal<number | null>(null);
  protected readonly tooltipPos = signal<{ x: number; y: number } | null>(null);

  protected readonly hoveredNode = computed(
    () =>
      this.sessionService.sessionItems().find((i) => i.session_item_id === this.hoveredItemId()) ??
      null,
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

  async onRemoveItem(sessionItemId: number): Promise<void> {
    await this.sessionService.removeItem(sessionItemId);
  }

  async onUpdateQty(sessionItemId: number, value: string): Promise<void> {
    const qty = parseInt(value, 10);
    if (!isNaN(qty)) await this.sessionService.updateQty(sessionItemId, qty);
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
}
