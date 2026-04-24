import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-copy-btn',
  template: `
    <button
      class="copy-btn"
      [class.copy-btn--copied]="copied()"
      (click)="copy($event)"
      [attr.aria-label]="'Copier ' + text()"
      title="Copier le nom"
      type="button">
      {{ copied() ? '✓' : '⎘' }}
    </button>
  `,
  styles: [`
    .copy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
      border: none;
      background: transparent;
      color: var(--text-dim);
      cursor: pointer;
      font-size: 0.85rem;
      line-height: 1;
      border-radius: var(--radius-sm);
      transition: color var(--transition), background var(--transition);
      flex-shrink: 0;
      &:hover { color: var(--accent); background: rgba(var(--accent-rgb, 99,102,241), 0.1); }
      &--copied { color: var(--success) !important; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyBtnComponent {
  readonly text = input.required<string>();

  protected readonly copied = signal(false);

  protected copy(event: Event): void {
    event.stopPropagation();
    navigator.clipboard.writeText(this.text()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }
}
