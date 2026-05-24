import { Injectable, signal } from '@angular/core';
import { GameLogEvent, CraftLogEvent, XpLogEvent } from '@electron';

@Injectable({ providedIn: 'root' })
export class LogWatcherService {
  readonly recentPurchases = signal<GameLogEvent[]>([]);
  readonly recentCrafts = signal<CraftLogEvent[]>([]);
  readonly recentLevelUps = signal<XpLogEvent[]>([]);

  start(): void {
    window.electronAPI.log.onGameEvent((event) => {
      this.recentPurchases.update((list) => [event, ...list].slice(0, 50));
    });
    window.electronAPI.log.onCraftEvent((event) => {
      this.recentCrafts.update((list) => [event, ...list].slice(0, 50));
    });
    window.electronAPI.log.onXpEvent((event) => {
      if (event.levelsGained > 0) {
        this.recentLevelUps.update((list) => [event, ...list].slice(0, 20));
      }
    });
  }

  dismiss(event: GameLogEvent): void {
    this.recentPurchases.update((list) => list.filter((e) => e !== event));
  }

  dismissCraft(event: CraftLogEvent): void {
    this.recentCrafts.update((list) => list.filter((e) => e !== event));
  }

  dismissLevelUp(event: XpLogEvent): void {
    this.recentLevelUps.update((list) => list.filter((e) => e !== event));
  }
}
