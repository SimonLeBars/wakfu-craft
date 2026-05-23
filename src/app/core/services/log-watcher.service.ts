import { Injectable, signal } from '@angular/core';
import { GameLogEvent } from '@electron';

@Injectable({ providedIn: 'root' })
export class LogWatcherService {
  readonly recentPurchases = signal<GameLogEvent[]>([]);

  start(): void {
    window.electronAPI.log.onGameEvent((event) => {
      this.recentPurchases.update((list) => [event, ...list].slice(0, 50));
    });
  }

  dismiss(event: GameLogEvent): void {
    this.recentPurchases.update((list) => list.filter((e) => e !== event));
  }
}
