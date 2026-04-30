import { PriceEntry, XpRecipe } from '@electron';

export type SortMode = 'xp-per-cost' | 'xp-times-profit';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface CostResult {
  cost:    number | null;
  missing: boolean;
  stale:   boolean;
}

export interface XpRow extends XpRecipe {
  gap:              number;
  successRate:      number;
  xpMultiplier:     number;
  effectiveXp:      number;
  ingredientCost:   number | null;
  sellRevenue:      number | null;
  profit:           number | null;
  xpPerCost:        number | null;
  xpTimesProfit:    number | null;
  score:            number | null;
  hasMissingPrices: boolean;
  hasStalePrices:   boolean;
}

export interface SubCraftItem {
  item_id:   number;
  item_name: Record<string, string>;
  rarity:    number;
}

export function resolveItemCost(
  itemId:     number,
  qty:        number,
  recipeMap:  Map<number, XpRecipe>,
  prices:     Record<number, PriceEntry>,
  profLevels: Record<number, number>,
  now:        number,
  visited:    Set<number>,
): CostResult {
  const entry      = prices[itemId];
  const marketCost = entry && !entry.not_for_sale ? entry.price * qty : null;
  const stale      = !!entry && !entry.not_for_sale && (now - new Date(entry.recorded_at).getTime() > ONE_DAY_MS);
  const recipe     = recipeMap.get(itemId);

  if (!recipe || visited.has(itemId)) {
    return { cost: marketCost, missing: marketCost === null, stale };
  }
  if ((profLevels[recipe.category_id] ?? 0) < recipe.recipe_level) {
    return { cost: marketCost, missing: marketCost === null, stale };
  }

  const nextVisited = new Set(visited).add(itemId);
  let craftTotal = 0, craftMissing = false, craftStale = false;

  for (const ing of recipe.ingredients) {
    const r = resolveItemCost(ing.item_id, ing.quantity, recipeMap, prices, profLevels, now, nextVisited);
    if (r.missing) { craftMissing = true; break; }
    craftTotal += r.cost!;
    if (r.stale) craftStale = true;
  }

  if (craftMissing) return { cost: marketCost, missing: marketCost === null, stale };

  const craftCostTotal = (craftTotal / recipe.result_quantity) * qty;
  if (marketCost === null || craftCostTotal < marketCost) {
    return { cost: craftCostTotal, missing: false, stale: craftStale };
  }
  return { cost: marketCost, missing: false, stale };
}

export function resolveIngredientsCost(
  ingredients: { item_id: number; quantity: number }[],
  recipeMap:   Map<number, XpRecipe>,
  prices:      Record<number, PriceEntry>,
  profLevels:  Record<number, number>,
  now:         number,
): CostResult {
  let total = 0, missing = false, stale = false;
  for (const ing of ingredients) {
    const r = resolveItemCost(ing.item_id, ing.quantity, recipeMap, prices, profLevels, now, new Set());
    if (r.missing) missing = true; else total += r.cost!;
    if (r.stale) stale = true;
  }
  return { cost: missing ? null : total, missing, stale };
}

export function wouldCraft(
  itemId:     number,
  recipeMap:  Map<number, XpRecipe>,
  prices:     Record<number, PriceEntry>,
  profLevels: Record<number, number>,
  now:        number,
  visited:    Set<number>,
): boolean {
  const subRecipe = recipeMap.get(itemId);
  if (!subRecipe || visited.has(itemId)) return false;
  if ((profLevels[subRecipe.category_id] ?? 0) < subRecipe.recipe_level) return false;
  const r           = resolveItemCost(itemId, 1, recipeMap, prices, profLevels, now, visited);
  const marketEntry = prices[itemId];
  return !marketEntry || marketEntry.not_for_sale || r.cost === null || r.cost < marketEntry.price;
}

export function collectSubCrafts(
  ingredients: { item_id: number; quantity: number }[],
  recipeMap:   Map<number, XpRecipe>,
  prices:      Record<number, PriceEntry>,
  profLevels:  Record<number, number>,
  now:         number,
  visited:     Set<number>,
): SubCraftItem[] {
  const result: SubCraftItem[] = [];
  for (const ing of ingredients) {
    if (!wouldCraft(ing.item_id, recipeMap, prices, profLevels, now, visited)) continue;
    const subRecipe   = recipeMap.get(ing.item_id)!;
    const nextVisited = new Set(visited).add(ing.item_id);
    result.push({ item_id: ing.item_id, item_name: subRecipe.item_name, rarity: subRecipe.rarity });
    result.push(...collectSubCrafts(subRecipe.ingredients, recipeMap, prices, profLevels, now, nextVisited));
  }
  return result;
}

function xpFactors(gap: number): { successRate: number; xpMultiplier: number } {
  if (gap > 0) {
    return { successRate: Math.max(0.1, (10 - gap) / 10), xpMultiplier: 1 + gap * 0.1 };
  }
  const below = -gap;
  return { successRate: 1, xpMultiplier: below <= 10 ? 1 : below < 20 ? (20 - below) / 10 : 0 };
}

export function computeEffectiveXp(xpRatio: number, gap: number): number {
  const { successRate, xpMultiplier } = xpFactors(gap);
  return xpRatio * xpMultiplier * successRate;
}

export function buildXpRow(
  r:           XpRecipe,
  playerLevel: number,
  sortMode:    SortMode,
  recipeMap:   Map<number, XpRecipe>,
  prices:      Record<number, PriceEntry>,
  profLevels:  Record<number, number>,
  now:         number,
): XpRow {
  const gap                        = r.recipe_level - playerLevel;
  const { successRate, xpMultiplier } = xpFactors(gap);
  const effectiveXp                = r.xp_ratio * xpMultiplier * successRate;

  const { cost: ingredientCost, missing: hasMissingPrices, stale: ingStale } =
    resolveIngredientsCost(r.ingredients, recipeMap, prices, profLevels, now);

  const resultEntry    = prices[r.item_id];
  const resultStale    = !!resultEntry && !resultEntry.not_for_sale
    && (now - new Date(resultEntry.recorded_at).getTime() > ONE_DAY_MS);
  const hasStalePrices = ingStale || resultStale;
  const sellRevenue    = resultEntry && !resultEntry.not_for_sale ? resultEntry.price * r.result_quantity : null;
  const profit         = ingredientCost !== null && sellRevenue !== null ? sellRevenue - ingredientCost : null;
  const xpPerCost      = effectiveXp > 0 && ingredientCost !== null && ingredientCost > 0
    ? effectiveXp / ingredientCost * 1000 : null;
  const xpTimesProfit  = effectiveXp > 0 && profit !== null ? effectiveXp * profit : null;
  const score          = sortMode === 'xp-per-cost' ? xpPerCost : xpTimesProfit;

  return { ...r, gap, successRate, xpMultiplier, effectiveXp, ingredientCost, sellRevenue,
           profit, xpPerCost, xpTimesProfit, score, hasMissingPrices, hasStalePrices };
}
