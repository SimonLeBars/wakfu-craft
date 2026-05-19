import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfessionProfileService } from '@services/profession-profile.service';
import { XpOptimizerService, SortMode } from '@services/xp-optimizer.service';
import { fuzzyMatch } from '@services/xp-optimizer.utils';
import { OptimizerControlsComponent, SortOption } from '@shared/components/optimizer/optimizer-controls.component';
import { OptimizerScanHelperComponent } from '@shared/components/optimizer/optimizer-scan-helper.component';
import { OptimizerItemNameComponent } from '@shared/components/optimizer/optimizer-item-name.component';
import { OptimizerSessionDialogComponent } from '@shared/components/optimizer/optimizer-session-dialog.component';

@Component({
  selector: 'app-xp-optimizer',
  templateUrl: './xp-optimizer.component.html',
  styleUrl: './xp-optimizer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FormsModule, OptimizerControlsComponent, OptimizerScanHelperComponent, OptimizerItemNameComponent, OptimizerSessionDialogComponent],
  host: {
    '(document:keydown.control.f)': 'focusSearch($event)',
  },
})
export class XpOptimizerComponent {
  protected readonly xp      = inject(XpOptimizerService);
  protected readonly profile = inject(ProfessionProfileService);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly sortOptions: SortOption[] = [
    { value: 'xp-per-cost',     label: 'XP / Coût' },
    { value: 'xp-times-roi', label: 'XP × ROI' },
  ];

  protected readonly sortHint = computed(() =>
    this.xp.sortMode() === 'xp-per-cost'
      ? 'Classement : XP effectif par 1 000 kamas dépensés — les recettes les moins chères à leveler arrivent en premier.'
      : 'Classement : XP effectif × ROI % — les recettes qui offrent le meilleur retour sur investissement <em>et</em> de l\'XP arrivent en premier.'
  );

  protected readonly typeNames = computed(() =>
    new Map(this.xp.itemService.itemTypes().map(t => [t.id, (t.name as Record<string, string>)['fr'] ?? `Type ${t.id}`]))
  );

  protected readonly filteredRows = computed(() => {
    const q = this.xp.searchQuery().trim();
    if (!q) return this.xp.rows();
    return this.xp.rows().filter(r => fuzzyMatch(r.item_name['fr'], q));
  });

  constructor() {
    this.profile.load();
  }

  protected setSortMode(value: string): void {
    this.xp.sortMode.set(value as SortMode);
  }

  protected focusSearch(event: Event): void {
    if (!this.xp.selectedCatId()) return;
    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
  }

  protected gapClass(gap: number): string {
    if (gap > 9)    return 'gap--impossible';
    if (gap > 0)    return 'gap--above';
    if (gap >= -10) return 'gap--optimal';
    if (gap > -20)  return 'gap--declining';
    return 'gap--zero';
  }

  protected formatXpPerCost(val: number | null): string {
    if (val == null) return '—';
    return val >= 1 ? val.toFixed(2) : val.toFixed(4);
  }

  protected formatXpTimesRoi(val: number | null): string {
    if (val == null) return '—';
    const abs = Math.abs(val);
    return abs >= 1_000_000
      ? (val / 1_000_000).toFixed(1) + ' M'
      : abs >= 1_000
        ? (val / 1_000).toFixed(1) + ' K'
        : val.toFixed(0);
  }
}
