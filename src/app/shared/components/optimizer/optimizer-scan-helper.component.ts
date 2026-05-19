import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ScanGroup, ScanItem } from '@services/xp-optimizer.utils';

@Component({
  selector: 'app-optimizer-scan-helper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './optimizer-scan-helper.component.html',
  styleUrl: './optimizer-scan-helper.component.scss',
})
export class OptimizerScanHelperComponent {
  readonly scanGroups = input.required<ScanGroup[]>();
  readonly typeNames  = input.required<Map<number, string>>();

  protected typeName(typeId: number): string {
    return this.typeNames().get(typeId) ?? `Type ${typeId}`;
  }

  protected truncateList(items: ScanItem[]): (ScanItem | null)[] {
    if (items.length <= 10) return items;
    return [...items.slice(0, 5), null, ...items.slice(-5)];
  }
}
