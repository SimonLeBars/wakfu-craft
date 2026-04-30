import { ChartConfiguration } from 'chart.js';
import { PriceEntry } from '@electron';

export type ViewMode = 'default' | 'week' | 'month';

export interface ChartPoint { label: string; price: number | null; }

const FR_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'default', label: 'Tout' },
  { value: 'month',   label: 'Mois' },
  { value: 'week',    label: 'Semaine' },
];

export function formatDate(recorded_at: string): string {
  return new Date(recorded_at).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function aggregateByDay(entries: PriceEntry[], cutoff: Date, now: Date): ChartPoint[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const key = dayKey(new Date(e.recorded_at));
    const cur = map.get(key);
    if (cur === undefined || e.price < cur) map.set(key, e.price);
  }

  const result: ChartPoint[] = [];
  const cursor = new Date(cutoff);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    const key = dayKey(cursor);
    const [y, m, d] = key.split('-');
    result.push({ label: `${d}/${m}/${y.slice(2)}`, price: map.get(key) ?? null });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export function aggregateBy8Hours(entries: PriceEntry[], cutoff: Date, now: Date): ChartPoint[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(e.recorded_at);
    const bucket = Math.floor(d.getHours() / 8) * 8;
    const key = `${dayKey(d)}-${pad(bucket)}`;
    const cur = map.get(key);
    if (cur === undefined || e.price < cur) map.set(key, e.price);
  }

  const result: ChartPoint[] = [];
  const cursor = new Date(cutoff);
  const end = new Date(now);
  end.setHours(Math.floor(now.getHours() / 8) * 8, 0, 0, 0);

  while (cursor <= end) {
    const key = `${dayKey(cursor)}-${pad(cursor.getHours())}`;
    const day = FR_DAYS[cursor.getDay()];
    result.push({
      label: `${day} ${pad(cursor.getDate())}/${pad(cursor.getMonth() + 1)} ${pad(cursor.getHours())}h`,
      price: map.get(key) ?? null,
    });
    cursor.setHours(cursor.getHours() + 8);
  }
  return result;
}

export function buildChartConfig(points: ChartPoint[], itemName: string): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels: points.map(p => p.label),
      datasets: [{
        label: itemName,
        data: points.map(p => p.price),
        borderColor: '#5865f2',
        backgroundColor: 'rgba(88, 101, 242, 0.1)',
        borderWidth: 2,
        pointBackgroundColor: '#5865f2',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.3,
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.y !== null
              ? `${ctx.parsed.y.toLocaleString('fr-FR')} k`
              : 'Aucune donnée',
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
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
