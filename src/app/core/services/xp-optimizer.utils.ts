import { PriceEntry, XpIngredient, XpRecipe } from '@electron';

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
  blockedSubCrafts: BlockedCraft[];
}

export interface SubCraftItem {
  item_id:   number;
  item_name: Record<string, string>;
  rarity:    number;
}

export interface BlockedCraft {
  item_id:        number;
  item_name:      Record<string, string>;
  category_name:  Record<string, string>;
  required_level: number;
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
  seen:        Set<number> = new Set(),
): SubCraftItem[] {
  const result: SubCraftItem[] = [];
  for (const ing of ingredients) {
    if (seen.has(ing.item_id)) continue;
    if (!wouldCraft(ing.item_id, recipeMap, prices, profLevels, now, visited)) continue;
    seen.add(ing.item_id);
    const subRecipe   = recipeMap.get(ing.item_id)!;
    const nextVisited = new Set(visited).add(ing.item_id);
    result.push({ item_id: ing.item_id, item_name: subRecipe.item_name, rarity: subRecipe.rarity });
    result.push(...collectSubCrafts(subRecipe.ingredients, recipeMap, prices, profLevels, now, nextVisited, seen));
  }
  return result;
}

export function collectBlockedCrafts(
  ingredients: { item_id: number; quantity: number }[],
  recipeMap:   Map<number, XpRecipe>,
  prices:      Record<number, PriceEntry>,
  profLevels:  Record<number, number>,
  now:         number,
  visited:     Set<number>,
  seen:        Set<number> = new Set(),
): BlockedCraft[] {
  const result: BlockedCraft[] = [];
  for (const ing of ingredients) {
    if (visited.has(ing.item_id) || seen.has(ing.item_id)) continue;
    const recipe = recipeMap.get(ing.item_id);
    if (!recipe) continue;
    seen.add(ing.item_id);
    if ((profLevels[recipe.category_id] ?? 0) < recipe.recipe_level) {
      const { cost: ingCost } = resolveIngredientsCost(recipe.ingredients, recipeMap, prices, profLevels, now);
      const craftPerUnit = ingCost !== null ? ingCost / recipe.result_quantity : null;
      const marketEntry  = prices[ing.item_id];
      const marketPrice  = marketEntry && !marketEntry.not_for_sale ? marketEntry.price : null;
      if (craftPerUnit !== null && (marketPrice === null || craftPerUnit < marketPrice)) {
        result.push({ item_id: ing.item_id, item_name: recipe.item_name, category_name: recipe.category_name, required_level: recipe.recipe_level });
      }
    } else if (wouldCraft(ing.item_id, recipeMap, prices, profLevels, now, visited)) {
      const nextVisited = new Set(visited).add(ing.item_id);
      result.push(...collectBlockedCrafts(recipe.ingredients, recipeMap, prices, profLevels, now, nextVisited, seen));
    }
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

export interface ScanItem {
  item_id:    number;
  item_name:  Record<string, string>;
  item_level: number;
  item_type:  number;
  status:     'missing' | 'stale';
}

export interface ScanGroup {
  type_id:     number;
  bracket_min: number;
  bracket_max: number;
  missing:     ScanItem[];
  stale:       ScanItem[];
}

function levelBracket(level: number): { min: number; max: number } {
  const idx = Math.floor((level - 1) / 15);
  return { min: idx * 15 + 1, max: idx * 15 + 15 };
}

export function buildScanGroups(
  recipes: XpRecipe[],
  subMap:  Map<number, XpRecipe>,
  altMap:  Map<number, XpRecipe[]>,
  prices:  Record<number, PriceEntry>,
  now:     number,
): ScanGroup[] {
  const seen      = new Set<number>();
  const scanItems: ScanItem[] = [];

  function addItem(item_id: number, item_name: Record<string, string>, item_level: number, item_type: number): void {
    if (seen.has(item_id)) return;
    seen.add(item_id);
    const entry = prices[item_id];
    if (!entry) {
      scanItems.push({ item_id, item_name, item_level, item_type, status: 'missing' });
    } else if (!entry.not_for_sale && now - new Date(entry.recorded_at).getTime() > ONE_DAY_MS) {
      scanItems.push({ item_id, item_name, item_level, item_type, status: 'stale' });
    }
  }

  // followAlts=true  : on est dans le chemin sélectionné → les alternatives de cet ingrédient sont explorées
  // followAlts=false : on est déjà à l'intérieur d'une alternative → on n'explore pas ses propres alternatives
  function traverse(ingredients: XpIngredient[], visited: Set<number>, followAlts: boolean): void {
    for (const ing of ingredients) {
      if (visited.has(ing.item_id)) continue;
      addItem(ing.item_id, ing.item_name, ing.item_level, ing.item_type);
      const nextVisited = new Set(visited).add(ing.item_id);
      const selected = subMap.get(ing.item_id);
      if (selected) traverse(selected.ingredients, nextVisited, followAlts);
      if (followAlts) {
        for (const alt of altMap.get(ing.item_id) ?? []) {
          if (alt === selected) continue;
          traverse(alt.ingredients, nextVisited, false);
        }
      }
    }
  }

  for (const recipe of recipes) {
    addItem(recipe.item_id, recipe.item_name, recipe.item_level, recipe.item_type);
    traverse(recipe.ingredients, new Set([recipe.item_id]), true);
  }

  const groupMap = new Map<string, ScanGroup>();
  for (const item of scanItems) {
    const { min, max } = levelBracket(item.item_level);
    const key = `${item.item_type}_${min}`;
    let group = groupMap.get(key);
    if (!group) {
      group = { type_id: item.item_type, bracket_min: min, bracket_max: max, missing: [], stale: [] };
      groupMap.set(key, group);
    }
    if (item.status === 'missing') group.missing.push(item);
    else group.stale.push(item);
  }

  // Merge adjacent brackets of the same type
  const byType = [...groupMap.values()].sort((a, b) =>
    a.type_id !== b.type_id ? a.type_id - b.type_id : a.bracket_min - b.bracket_min
  );
  const merged: ScanGroup[] = [];
  for (const group of byType) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type_id === group.type_id && prev.bracket_max + 1 === group.bracket_min) {
      prev.bracket_max = group.bracket_max;
      prev.missing.push(...group.missing);
      prev.stale.push(...group.stale);
    } else {
      merged.push(group);
    }
  }

  const byLevel = (a: ScanItem, b: ScanItem) => a.item_level - b.item_level;
  for (const g of merged) {
    g.missing.sort(byLevel);
    g.stale.sort(byLevel);
  }

  return merged.sort((a, b) =>
    a.bracket_min !== b.bracket_min ? a.bracket_min - b.bracket_min : a.type_id - b.type_id
  );
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
  const score            = sortMode === 'xp-per-cost' ? xpPerCost : xpTimesProfit;
  const blockedSubCrafts = collectBlockedCrafts(r.ingredients, recipeMap, prices, profLevels, now, new Set());

  return { ...r, gap, successRate, xpMultiplier, effectiveXp, ingredientCost, sellRevenue,
           profit, xpPerCost, xpTimesProfit, score, hasMissingPrices, hasStalePrices, blockedSubCrafts };
}
