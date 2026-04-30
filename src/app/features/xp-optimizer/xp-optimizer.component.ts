import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfessionProfileService } from '@services/profession-profile.service';
import { XpOptimizerService } from '@services/xp-optimizer.service';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';

@Component({
  selector: 'app-xp-optimizer',
  templateUrl: './xp-optimizer.component.html',
  styleUrl: './xp-optimizer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DecimalPipe, RarityColorPipe, RarityLabelPipe],
})
export class XpOptimizerComponent {
  protected readonly xp      = inject(XpOptimizerService);
  protected readonly profile = inject(ProfessionProfileService);

  constructor() {
    this.profile.load();
  }

  protected gapClass(gap: number): string {
    if (gap > 9)    return 'gap--impossible';
    if (gap > 0)    return 'gap--above';
    if (gap >= -10) return 'gap--optimal';
    if (gap > -20)  return 'gap--declining';
    return 'gap--zero';
  }

  protected formatXpPerCost(val: number | null): string {
    if (val == null) return '—';
    return val >= 1 ? val.toFixed(2) : val.toFixed(4);
  }

  protected formatXpTimesProfit(val: number | null): string {
    if (val == null) return '—';
    const abs = Math.abs(val);
    return abs >= 1_000_000
      ? (val / 1_000_000).toFixed(1) + ' M'
      : abs >= 1_000
        ? (val / 1_000).toFixed(1) + ' K'
        : val.toFixed(0);
  }
}
