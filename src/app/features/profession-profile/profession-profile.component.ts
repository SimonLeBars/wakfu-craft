import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProfessionProfileService } from '../../core/services/profession-profile.service';

@Component({
  selector: 'app-profession-profile',
  templateUrl: './profession-profile.component.html',
  styleUrl: './profession-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class ProfessionProfileComponent {
  protected readonly profile = inject(ProfessionProfileService);

  readonly craftCategories    = computed(() => this.profile.categories().filter(c => !c.is_innate));
  readonly gatheringCategories = computed(() => this.profile.categories().filter(c => c.is_innate));

  constructor() {
    this.profile.load();
  }

  protected onLevelChange(categoryId: number, value: string): void {
    const level = Math.min(230, Math.max(0, parseInt(value, 10) || 0));
    this.profile.setLevel(categoryId, level);
  }

  protected levelOf(categoryId: number): number {
    return this.profile.getLevel(categoryId);
  }
}
