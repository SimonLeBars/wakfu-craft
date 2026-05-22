import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { SessionService } from '@services/session.service';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';

@Component({
  selector: 'app-session-craft-order',
  imports: [RarityColorPipe, RarityLabelPipe, CopyBtnComponent],
  templateUrl: './session-craft-order.component.html',
  styleUrl: './session-craft-order.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionCraftOrderComponent {
  protected readonly sessionService = inject(SessionService);
}
