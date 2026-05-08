import { GridConfig, GridRow, WakfuItem } from '@electron';
import { EditableRow } from './ocr-state.service';

export const GRID_STORAGE_KEY    = 'ocr_grid';
export const DEFAULT_RARITY_KEY = 'ocr_default_rarity';

export function loadDefaultRarity(): number | null {
  const raw = localStorage.getItem(DEFAULT_RARITY_KEY);
  if (raw === null) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

export function saveDefaultRarity(rarity: number | null): void {
  if (rarity === null) localStorage.removeItem(DEFAULT_RARITY_KEY);
  else localStorage.setItem(DEFAULT_RARITY_KEY, String(rarity));
}

export function itemDisplayName(item: WakfuItem): string {
  return item.name['fr'] ?? Object.values(item.name)[0] ?? '?';
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

export function matchRow(row: GridRow, results: WakfuItem[], defaultRarity?: number | null): EditableRow {
  const candidates = row.level !== null
    ? results.filter(i => i.level === row.level)
    : results.length === 1 ? results : [];

  if (candidates.length === 0) {
    return { itemId: null, rarity: null, nameInput: row.name, price: row.price };
  }

  const narrowed = defaultRarity != null && candidates.length > 1
    ? (candidates.some(i => i.rarity === defaultRarity)
        ? candidates.filter(i => i.rarity === defaultRarity)
        : candidates)
    : candidates;

  const ocrName = row.name.trim().toLowerCase();
  const match   = narrowed.reduce((best, item) =>
    levenshtein(ocrName, itemDisplayName(item).toLowerCase()) <
    levenshtein(ocrName, itemDisplayName(best).toLowerCase()) ? item : best
  );

  return {
    itemId:    match.id,
    rarity:    match.rarity,
    nameInput: `${itemDisplayName(match)} (Niv. ${match.level})`,
    price:     row.price,
  };
}

export function loadGrid(): GridConfig | null {
  try {
    const raw = localStorage.getItem(GRID_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GridConfig) : null;
  } catch {
    return null;
  }
}

export function saveGrid(grid: GridConfig): void {
  localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(grid));
}
