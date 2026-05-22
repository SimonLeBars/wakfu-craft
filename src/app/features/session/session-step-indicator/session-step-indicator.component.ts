import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { SessionService } from '@services/session.service';
import { SessionStep } from '@electron';

const STEPS: { key: SessionStep; label: string }[] = [
  { key: 'preparation', label: 'Préparation' },
  { key: 'purchase', label: 'Achat' },
  { key: 'craft', label: 'Craft' },
  { key: 'listing', label: 'Mise en vente' },
  { key: 'sale', label: 'Vente' },
];

const STEP_ORDER: SessionStep[] = ['preparation', 'purchase', 'craft', 'listing', 'sale'];

@Component({
  selector: 'app-session-step-indicator',
  templateUrl: './session-step-indicator.component.html',
  styleUrl: './session-step-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionStepIndicatorComponent {
  protected readonly sessionService = inject(SessionService);
  protected readonly steps = STEPS;

  protected getStatus(key: SessionStep): 'past' | 'current' | 'future' {
    const current = this.sessionService.activeSession()?.step ?? 'preparation';
    const stepIdx = STEP_ORDER.indexOf(key);
    const currIdx = STEP_ORDER.indexOf(current);
    if (stepIdx < currIdx) return 'past';
    if (stepIdx === currIdx) return 'current';
    return 'future';
  }

  protected async onStepClick(key: SessionStep): Promise<void> {
    if (this.getStatus(key) === 'past') {
      await this.sessionService.setStep(key);
    }
  }
}
