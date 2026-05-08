import {
  Component, input, output, viewChild, OnDestroy,
  ElementRef, ChangeDetectionStrategy, effect, computed, signal,
} from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { PriceEntry } from '@electron';
import {
  ViewMode, ChartPoint, VIEW_OPTIONS,
  formatDate, aggregateByDay, aggregateBy8Hours, buildChartConfig,
} from './price-chart.utils';

Chart.register(...registerables);

@Component({
  selector: 'app-price-chart',
  imports: [],
  template: `
    <div class="chart-container">
      <div class="chart-header">
        <h3>Historique du prix</h3>
        <div class="view-controls" role="group" aria-label="Période d'affichage">
          @for (opt of viewOptions; track opt.value) {
            <button
              type="button"
              [class.active]="viewMode() === opt.value"
              [attr.aria-pressed]="viewMode() === opt.value"
              (click)="viewMode.set(opt.value)">
              {{ opt.label }}
            </button>
          }
        </div>
      </div>
      <div class="no-data" [class.hidden]="hasEnoughData()">
        Pas assez de données — saisis au moins 2 prix à des dates différentes
      </div>
      <canvas #chartCanvas [class.hidden]="!hasEnoughData()"></canvas>
      @if (viewMode() === 'default' && history().length > 0) {
        <ul class="entry-list" aria-label="Liste des entrées de prix">
          @for (entry of history(); track entry.id) {
            <li>
              <span class="entry-date">{{ formatDate(entry.recorded_at) }}</span>
              <span class="entry-price" [class.nfs]="entry.not_for_sale">
                {{ entry.not_for_sale ? 'Pas à vendre' : formatPrice(entry.price) }}
              </span>
              @if (pendingDeleteId() === entry.id) {
                <span class="confirm-label">Supprimer ?</span>
                <button
                  type="button"
                  class="btn-confirm"
                  aria-label="Confirmer la suppression"
                  (click)="confirmDelete(entry.id)">
                  Oui
                </button>
                <button
                  type="button"
                  class="btn-cancel"
                  aria-label="Annuler la suppression"
                  (click)="pendingDeleteId.set(null)">
                  Non
                </button>
              } @else {
                <button
                  type="button"
                  class="btn-delete"
                  aria-label="Supprimer cette entrée"
                  (click)="pendingDeleteId.set(entry.id)">
                  ×
                </button>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .chart-container {
      background: #1a1a2e;
      border-radius: 8px;
      padding: 20px;
      margin-top: 24px;
      border: 1px solid #2a2a3e;
    }
    .chart-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;

      h3 {
        margin: 0;
        color: #a0a0d0;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    }
    .view-controls {
      display: flex;
      gap: 4px;

      button {
        background: transparent;
        border: 1px solid #2a2a3e;
        color: #666;
        border-radius: 4px;
        padding: 4px 10px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: background 0.15s, color 0.15s, border-color 0.15s;

        &:hover { border-color: #5865f2; color: #a0a0d0; }
        &.active { background: #5865f2; border-color: #5865f2; color: #fff; }
        &:focus-visible { outline: 2px solid #5865f2; outline-offset: 2px; }
      }
    }
    .no-data {
      color: #555;
      font-size: 0.85rem;
      text-align: center;
      padding: 24px 0;
      font-style: italic;
    }
    .hidden { display: none; }
    canvas { width: 100% !important; }

    .entry-list {
      list-style: none;
      margin: 16px 0 0;
      padding: 0;
      max-height: 200px;
      overflow-y: auto;
      border-top: 1px solid #2a2a3e;

      li {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 0;
        border-bottom: 1px solid #1e1e32;
        font-size: 0.82rem;

        &:last-child { border-bottom: none; }
      }

      .entry-date { color: #666; flex: 1; }
      .entry-price { color: #a0a0d0; min-width: 80px; text-align: right; }
      .entry-price.nfs { color: #555; font-style: italic; }

      .confirm-label { color: #a0a0d0; font-size: 0.8rem; margin-left: auto; }

      .btn-delete, .btn-confirm, .btn-cancel {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 0.8rem;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 3px;
        transition: color 0.15s, background 0.15s;
        &:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      }
      .btn-delete {
        color: #444;
        font-size: 1rem;
        &:hover { color: #e05050; background: rgba(224, 80, 80, 0.1); }
      }
      .btn-confirm {
        color: #e05050;
        border: 1px solid #e05050;
        &:hover { background: rgba(224, 80, 80, 0.15); }
      }
      .btn-cancel {
        color: #666;
        border: 1px solid #444;
        &:hover { color: #a0a0d0; border-color: #666; }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceChartComponent implements OnDestroy {
  readonly history        = input<PriceEntry[]>([]);
  readonly itemName       = input<string>('');
  readonly deleteEntry    = output<number>();
  readonly pendingDeleteId = signal<number | null>(null);

  readonly viewMode    = signal<ViewMode>('default');
  readonly viewOptions = VIEW_OPTIONS;

  readonly pricedHistory = computed(() => this.history().filter(e => !e.not_for_sale));

  readonly chartPoints = computed((): ChartPoint[] => {
    const priced = this.pricedHistory();
    const mode   = this.viewMode();

    if (mode === 'default') {
      return priced.map(e => ({ label: formatDate(e.recorded_at), price: e.price }));
    }

    const now    = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() - (mode === 'month' ? 30 : 7));
    cutoff.setHours(0, 0, 0, 0);

    const filtered = priced.filter(e => new Date(e.recorded_at) >= cutoff);
    return mode === 'month'
      ? aggregateByDay(filtered, cutoff, now)
      : aggregateBy8Hours(filtered, cutoff, now);
  });

  readonly hasEnoughData = computed(() =>
    this.chartPoints().filter(p => p.price !== null).length >= 2
  );

  private readonly chartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const points = this.chartPoints();
      const enough = this.hasEnoughData();
      this.destroyChart();
      if (enough) setTimeout(() => this.renderChart(points), 0);
    });
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  confirmDelete(id: number): void {
    this.pendingDeleteId.set(null);
    this.deleteEntry.emit(id);
  }

  formatDate(recorded_at: string): string {
    return formatDate(recorded_at);
  }

  formatPrice(price: number): string {
    return `${price.toLocaleString('fr-FR')} k`;
  }

  private renderChart(points: ChartPoint[]): void {
    const canvas = this.chartCanvas()?.nativeElement;
    if (!canvas) return;
    this.chart = new Chart(canvas, buildChartConfig(points, this.itemName()));
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
