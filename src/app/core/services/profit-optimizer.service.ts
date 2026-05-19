import { Injectable, computed, signal } from '@angular/core';
import { ProfitSortMode, ProfitRow, BlockedCraft, ScanGroup, buildProfitRow } from './profit-optimizer.utils';
import { SubCraftItem } from './xp-optimizer.utils';
import { BaseOptimizerService } from './optimizer-base.service';

export type { ProfitSortMode, ProfitRow, BlockedCraft, SubCraftItem, ScanGroup };

@Injectable({ providedIn: 'root' })
export class ProfitOptimizerService extends BaseOptimizerService<ProfitRow> {
  readonly sortMode = signal<ProfitSortMode>('profit');

  readonly rows = computed((): ProfitRow[] => {
    const prices     = this.prices();
    const sortMode   = this.sortMode();
    const recipeMap  = this.subRecipeMap();
    const profLevels = this.profile.levels();
    const now        = Date.now();

    return this.recipes()
      .map(r => buildProfitRow(r, sortMode, recipeMap, prices, profLevels, now))
      .sort((a, b) => {
        if (a.score == null && b.score == null) return a.recipe_level - b.recipe_level;
        if (a.score == null) return 1;
        if (b.score == null) return -1;
        return b.score - a.score;
      });
  });

  protected getLevelRange(playerLevel: number): { min: number; max: number } {
    return { min: 1, max: playerLevel };
  }
}
