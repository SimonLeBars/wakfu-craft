import { PriceEntry, XpRecipe } from '@electron';
export { fuzzyMatch } from '@common/fuzzy-match';
import {
  BlockedCraft, SubCraftItem, ScanItem, ScanGroup, CostResult,
  resolveIngredientsCost, collectBlockedCrafts, ONE_DAY_MS,
} from './xp-optimizer.utils';

export type { BlockedCraft, SubCraftItem, ScanItem, ScanGroup, CostResult };
export { resolveIngredientsCost, collectBlockedCrafts, ONE_DAY_MS };

export type ProfitSortMode = 'profit' | 'roi';

export interface ProfitRow extends XpRecipe {
  ingredientCost:   number | null;
  sellRevenue:      number | null;
  profit:           number | null;
  roi:              number | null;
  score:            number | null;
  hasMissingPrices: boolean;
  hasStalePrices:   boolean;
  blockedSubCrafts: BlockedCraft[];
}

export function buildProfitRow(
  r:           XpRecipe,
  sortMode:    ProfitSortMode,
  recipeMap:   Map<number, XpRecipe>,
  prices:      Record<number, PriceEntry>,
  profLevels:  Record<number, number>,
  now:         number,
): ProfitRow {
  const { cost: ingredientCost, missing: hasMissingPrices, stale: ingStale } =
    resolveIngredientsCost(r.ingredients, recipeMap, prices, profLevels, now);

  const resultEntry    = prices[r.item_id];
  const resultStale    = !!resultEntry && !resultEntry.not_for_sale
    && (now - new Date(resultEntry.recorded_at).getTime() > ONE_DAY_MS);
  const hasStalePrices = ingStale || resultStale;
  const sellRevenue    = resultEntry && !resultEntry.not_for_sale ? resultEntry.price * r.result_quantity : null;
  const profit         = ingredientCost !== null && sellRevenue !== null ? sellRevenue - ingredientCost : null;
  const roi            = profit !== null && ingredientCost !== null && ingredientCost > 0
    ? (profit / ingredientCost) * 100 : null;
  const score          = sortMode === 'profit' ? profit : roi;
  const blockedSubCrafts = collectBlockedCrafts(r.ingredients, recipeMap, prices, profLevels, now, new Set());

  return { ...r, ingredientCost, sellRevenue, profit, roi, score, hasMissingPrices, hasStalePrices, blockedSubCrafts };
}
