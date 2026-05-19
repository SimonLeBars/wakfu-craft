import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfessionProfileService } from '@services/profession-profile.service';
import { ProfitOptimizerService, ProfitSortMode } from '@services/profit-optimizer.service';
import { fuzzyMatch } from '@services/profit-optimizer.utils';
import { OptimizerControlsComponent, SortOption } from '@shared/components/optimizer/optimizer-controls.component';
import { OptimizerScanHelperComponent } from '@shared/components/optimizer/optimizer-scan-helper.component';
import { OptimizerItemNameComponent } from '@shared/components/optimizer/optimizer-item-name.component';
import { OptimizerSessionDialogComponent } from '@shared/components/optimizer/optimizer-session-dialog.component';

@Component({
  selector: 'app-profit-optimizer',
  templateUrl: './profit-optimizer.component.html',
  styleUrl: './profit-optimizer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FormsModule, OptimizerControlsComponent, OptimizerScanHelperComponent, OptimizerItemNameComponent, OptimizerSessionDialogComponent],
  host: {
    '(document:keydown.control.f)': 'focusSearch($event)',
  },
})
export class ProfitOptimizerComponent {
  protected readonly profit  = inject(ProfitOptimizerService);
  protected readonly profile = inject(ProfessionProfileService);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly sortOptions: SortOption[] = [
    { value: 'profit', label: 'Profit brut' },
    { value: 'roi',    label: 'ROI %' },
  ];

  protected readonly sortHint = computed(() =>
    this.profit.sortMode() === 'profit'
      ? 'Classement : profit brut par craft (kamas gagnés) — les recettes les plus rentables arrivent en premier.'
      : 'Classement : ROI % (profit / coût ingrédients) — les recettes qui rapportent le plus par kama investi arrivent en premier.'
  );

  protected readonly typeNames = computed(() =>
    new Map(this.profit.itemService.itemTypes().map(t => [t.id, (t.name as Record<string, string>)['fr'] ?? `Type ${t.id}`]))
  );

  protected readonly filteredRows = computed(() => {
    const q = this.profit.searchQuery().trim();
    if (!q) return this.profit.rows();
    return this.profit.rows().filter(r => fuzzyMatch(r.item_name['fr'], q));
  });

  constructor() {
    this.profile.load();
  }

  protected setSortMode(value: string): void {
    this.profit.sortMode.set(value as ProfitSortMode);
  }

  protected focusSearch(event: Event): void {
    if (!this.profit.selectedCatId()) return;
    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
  }

  protected formatProfit(val: number | null): string {
    if (val == null) return '—';
    const abs = Math.abs(val);
    return abs >= 1_000_000
      ? (val / 1_000_000).toFixed(1) + ' M k'
      : abs >= 1_000
        ? (val / 1_000).toFixed(1) + ' K k'
        : val.toFixed(0) + ' k';
  }

  protected formatRoi(val: number | null): string {
    if (val == null) return '—';
    return val.toFixed(1) + ' %';
  }
}
