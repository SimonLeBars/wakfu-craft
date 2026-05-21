import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '@services/session.service';
import { CraftSession } from '@electron';

@Component({
  selector: 'app-session-list',
  imports: [FormsModule],
  templateUrl: './session-list.component.html',
  styleUrl: './session-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionListComponent {
  protected readonly sessionService = inject(SessionService);

  protected readonly newSessionName = signal('');
  protected readonly showNewSession = signal(false);
  protected readonly renamingId = signal<number | null>(null);
  protected readonly renameValue = signal('');

  async onCreateSession(): Promise<void> {
    if (!this.newSessionName().trim()) return;
    await this.sessionService.createSession(this.newSessionName().trim());
    this.newSessionName.set('');
    this.showNewSession.set(false);
  }

  onStartRename(session: CraftSession, event: Event): void {
    event.stopPropagation();
    this.renamingId.set(session.id);
    this.renameValue.set(session.name);
  }

  async onConfirmRename(): Promise<void> {
    const id = this.renamingId();
    const name = this.renameValue().trim();
    if (id !== null && name) await this.sessionService.renameSession(id, name);
    this.renamingId.set(null);
  }

  onCancelRename(event?: Event): void {
    event?.stopPropagation();
    this.renamingId.set(null);
  }

  async onSelectSession(session: CraftSession): Promise<void> {
    await this.sessionService.selectSession(session);
  }
}
