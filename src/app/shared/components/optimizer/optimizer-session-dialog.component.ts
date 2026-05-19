import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';
import { BlockedCraft, SubCraftItem } from '@services/xp-optimizer.utils';

export interface DialogRow {
  item_name: Record<string, string>;
  rarity:    number;
}

@Component({
  selector: 'app-optimizer-session-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RarityColorPipe, RarityLabelPipe],
  templateUrl: './optimizer-session-dialog.component.html',
  styleUrl: './optimizer-session-dialog.component.scss',
})
export class OptimizerSessionDialogComponent {
  readonly row            = input.required<DialogRow>();
  readonly qty            = input.required<number>();
  readonly subCrafts      = input.required<SubCraftItem[]>();
  readonly blockedCrafts  = input.required<BlockedCraft[]>();
  readonly checkedBlocked = input.required<Set<number>>();

  readonly closeDialog   = output<void>();
  readonly confirmAdd    = output<void>();
  readonly qtyChange     = output<number>();
  readonly toggleBlocked = output<number>();
}
