import {
  Component, input, viewChild, OnDestroy,
  ElementRef, ChangeDetectionStrategy, effect, computed,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { PriceEntry } from '@electron';

Chart.register(...registerables);

@Component({
  selector: 'app-price-chart',
  imports: [],
  template: `
    <div class="chart-container">
      <h3>Historique du prix</h3>
      <div class="no-data" [class.hidden]="pricedHistory().length >= 2">
        Pas assez de données — saisis au moins 2 prix à des dates différentes
      </div>
      <canvas #chartCanvas [class.hidden]="history().length < 2"></canvas>
    </div>
  `,
  styles: [`
    .chart-container {
      background: #1a1a2e;
      border-radius: 8px;
      padding: 20px;
      margin-top: 24px;
      border: 1px solid #2a2a3e;

      h3 {
        margin: 0 0 16px;
        color: #a0a0d0;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceChartComponent implements OnDestroy {
  readonly history  = input<PriceEntry[]>([]);
  readonly itemName = input<string>('');

  readonly pricedHistory = computed(() => this.history().filter(e => !e.not_for_sale));

  private readonly chartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');

  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const priced = this.pricedHistory();
      this.destroyChart();
      if (priced.length >= 2) setTimeout(() => this.renderChart(priced), 0);
    });
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  private renderChart(priced: PriceEntry[]): void {
    const canvas = this.chartCanvas()?.nativeElement;
    if (!canvas) return;

    const labels = priced.map(e =>
      new Date(e.recorded_at).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    );

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: this.itemName(),
          data: priced.map(e => e.price),
          borderColor: '#5865f2',
          backgroundColor: 'rgba(88, 101, 242, 0.1)',
          borderWidth: 2,
          pointBackgroundColor: '#5865f2',
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${(ctx.parsed.y ?? 0).toLocaleString('fr-FR')} k`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#666', maxRotation: 45, font: { size: 10 } },
            grid: { color: '#1e1e32' },
          },
          y: {
            ticks: {
              color: '#666',
              callback: val => `${Number(val).toLocaleString('fr-FR')} k`,
            },
            grid: { color: '#1e1e32' },
          },
        },
      },
    };

    this.chart = new Chart(canvas, config);
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
