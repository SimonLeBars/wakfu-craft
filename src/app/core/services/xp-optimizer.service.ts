import { Injectable, computed, signal } from '@angular/core';
import {
  SortMode, XpRow, SubCraftItem, BlockedCraft, ScanGroup,
  buildXpRow,
} from './xp-optimizer.utils';
import { BaseOptimizerService } from './optimizer-base.service';

export type { SortMode, XpRow, SubCraftItem, BlockedCraft, ScanGroup };

@Injectable({ providedIn: 'root' })
export class XpOptimizerService extends BaseOptimizerService<XpRow> {
  readonly sortMode = signal<SortMode>('xp-per-cost');

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

  protected getLevelRange(playerLevel: number): { min: number; max: number } {
    return { min: playerLevel - 19, max: playerLevel + 9 };
  }
}
