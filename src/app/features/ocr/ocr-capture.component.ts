import { Component, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { GridConfig, GridRow, WakfuItem } from '@electron';
import { RarityColorPipe, RarityLabelPipe } from '../../shared/pipes/rarity.pipe';
import { OcrStateService, EditableRow } from './ocr-state.service';
import { PriceService } from '../../core/services/price.service';

const GRID_STORAGE_KEY = 'ocr_grid';
const COL_LABELS = ['Nom', 'Lvl', 'Qté', 'Prix'] as const;

@Component({
  selector: 'app-ocr-capture',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RarityColorPipe, RarityLabelPipe],
  templateUrl: './ocr-capture.component.html',
  styleUrl: './ocr-capture.component.scss',
})
export class OcrCaptureComponent {
  private readonly state        = inject(OcrStateService);
  private readonly priceService = inject(PriceService);

  protected readonly colLabels = COL_LABELS;

  protected readonly savedGrid = signal<GridConfig | null>(this.loadGrid());
  protected readonly scanning  = signal(false);

  // État persistant via le service (survit aux changements d'onglet)
  protected readonly tableRows  = this.state.tableRows;
  protected readonly editRows   = this.state.editRows;
  protected readonly savedCount = this.state.savedCount;
  protected readonly status     = this.state.status;

  protected readonly activeSuggRow = signal<number | null>(null);
  protected readonly suggestions   = signal<WakfuItem[]>([]);
  protected readonly saving        = signal(false);

  protected readonly firstRowStages = computed(() => this.tableRows()?.[0]?.stageImages ?? null);

  protected readonly saveableCount = computed(() =>
    this.editRows().filter(r => r.itemId !== null && r.price !== null).length
  );

  protected readonly gridSize = computed(() => {
    const g = this.savedGrid();
    if (!g) return '';
    const w = g.colWidths.reduce((a, b) => a + b, 0);
    const h = g.rowHeights.reduce((a, b) => a + b, 0);
    return `${w} × ${h} px`;
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  async scanTable(): Promise<void> {
    const grid = this.savedGrid();
    if (!grid) return;

    this.scanning.set(true);
    this.tableRows.set(null);
    this.editRows.set([]);
    this.savedCount.set(0);
    this.status.set('Analyse du tableau en cours…');

    try {
      const rows = await window.electronAPI.ocr.captureGrid(grid);
      if (rows) {
        this.tableRows.set(rows);
        this.editRows.set(await this.autoMatchRows(rows));
        this.status.set('');
      } else {
        this.status.set('Erreur lors de la capture.');
      }
    } finally {
      this.scanning.set(false);
    }
  }

  protected onNameInput(rowIndex: number, value: string): void {
    this.editRows.update(rows => rows.map((r, i) =>
      i === rowIndex ? { ...r, nameInput: value, itemId: null, rarity: null } : r
    ));

    if (this.searchTimer) clearTimeout(this.searchTimer);

    if (value.trim().length < 2) {
      this.activeSuggRow.set(null);
      this.suggestions.set([]);
      return;
    }

    this.searchTimer = setTimeout(async () => {
      this.activeSuggRow.set(rowIndex);
      const results = await window.electronAPI.searchItems(value.trim(), 'fr');
      if (this.activeSuggRow() === rowIndex) {
        this.suggestions.set(results.slice(0, 8));
      }
    }, 250);
  }

  protected selectSuggestion(rowIndex: number, item: WakfuItem): void {
    const name = item.name['fr'] ?? Object.values(item.name)[0] ?? '';
    this.editRows.update(rows => rows.map((r, i) =>
      i === rowIndex
        ? { ...r, itemId: item.id, rarity: item.rarity, nameInput: `${name} (Niv. ${item.level})` }
        : r
    ));
    this.activeSuggRow.set(null);
    this.suggestions.set([]);
  }

  protected closeSuggestions(): void {
    setTimeout(() => {
      this.activeSuggRow.set(null);
      this.suggestions.set([]);
    }, 150);
  }

  protected onPriceInput(rowIndex: number, value: string): void {
    const n = parseInt(value, 10);
    this.editRows.update(rows => rows.map((r, i) =>
      i === rowIndex ? { ...r, price: isNaN(n) ? null : n } : r
    ));
  }

  protected itemDisplayName(item: WakfuItem): string {
    return item.name['fr'] ?? Object.values(item.name)[0] ?? '?';
  }

  async saveAllPrices(): Promise<void> {
    this.saving.set(true);
    try {
      const rows = this.editRows().filter(r => r.itemId !== null && r.price !== null);
      await Promise.all(rows.map(r => this.priceService.setPrice(r.itemId!, r.price!)));
      this.savedCount.set(rows.length);
    } catch {
      this.status.set('Erreur lors de l\'enregistrement des prix.');
    } finally {
      this.saving.set(false);
    }
  }

  async openGridOverlay(): Promise<void> {
    this.status.set('Configurez la grille dans l\'overlay…');
    const grid = await window.electronAPI.ocr.openGridOverlay(this.savedGrid() ?? undefined);
    if (grid) {
      this.savedGrid.set(grid);
      localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(grid));
      this.status.set('Grille enregistrée.');
    } else {
      this.status.set('Configuration annulée.');
    }
  }

  private async autoMatchRows(rows: GridRow[]): Promise<EditableRow[]> {
    return Promise.all(rows.map(async (r) => {
      if (r.name.trim().length < 2) {
        return { itemId: null, rarity: null, nameInput: r.name, price: r.price };
      }
      const results = await window.electronAPI.searchItems(r.name.trim(), 'fr');
      const candidates = r.level !== null
        ? results.filter(i => i.level === r.level)
        : results.length === 1 ? results : [];
      if (candidates.length === 0) {
        return { itemId: null, rarity: null, nameInput: r.name, price: r.price };
      }
      const ocrName = r.name.trim().toLowerCase();
      const match = candidates.reduce((best, item) => {
        const itemName = this.itemDisplayName(item).toLowerCase();
        const bestName = this.itemDisplayName(best).toLowerCase();
        return this.levenshtein(ocrName, itemName) < this.levenshtein(ocrName, bestName) ? item : best;
      });
      const name = this.itemDisplayName(match);
      return { itemId: match.id, rarity: match.rarity, nameInput: `${name} (Niv. ${match.level})`, price: r.price };
    }));
  }

  private levenshtein(a: string, b: string): number {
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

  private loadGrid(): GridConfig | null {
    try {
      const raw = localStorage.getItem(GRID_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as GridConfig) : null;
    } catch {
      return null;
    }
  }
}
