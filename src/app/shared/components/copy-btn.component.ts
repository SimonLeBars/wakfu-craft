import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-copy-btn',
  host: { style: 'display: contents' },
  template: `
    <button
      class="copy-btn"
      [class.copy-btn--copied]="copied()"
      (click)="copy($event)"
      [attr.aria-label]="'Copier ' + text()"
      title="Copier"
      type="button">
      {{ text() }}<span class="copy-btn__icon" aria-hidden="true">{{ copied() ? ' ✓' : ' ⎘' }}</span>
    </button>
  `,
  styles: [`
    :host { display: contents; }
    .copy-btn {
      display: inline-flex;
      align-items: center;
      padding: 0 4px;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      line-height: inherit;
      border-radius: var(--radius-sm);
      transition: background var(--transition);
      flex-shrink: 0;
      &:hover { background: rgba(var(--accent-rgb, 99,102,241), 0.1); }
      &--copied .copy-btn__icon { color: var(--success) !important; }
    }
    .copy-btn__icon {
      color: var(--text-dim);
      font-size: 0.85em;
      flex-shrink: 0;
      transition: color var(--transition);
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
