import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SortOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-optimizer-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './optimizer-controls.component.html',
  styleUrl: './optimizer-controls.component.scss',
})
export class OptimizerControlsComponent {
  readonly craftCategories = input.required<Array<{ id: number; name: Record<string, string> }>>();
  readonly selectedCatId   = input.required<number | null>();
  readonly playerLevel     = input.required<number>();
  readonly sortOptions     = input.required<SortOption[]>();
  readonly sortMode        = input.required<string>();
  readonly sortHint        = input.required<string>();

  readonly categoryChange  = output<number | null>();
  readonly levelChange     = output<number>();
  readonly sortModeChange  = output<string>();
  readonly refresh         = output<void>();
}
