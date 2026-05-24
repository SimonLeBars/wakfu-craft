import { Component, OnInit, inject, signal, effect, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { LogWatcherService } from '@services/log-watcher.service';
import { ProfessionProfileService } from '@services/profession-profile.service';
import { XpLogEvent } from '@electron';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('wakfu-craft');

  private readonly logWatcher = inject(LogWatcherService);
  private readonly professionService = inject(ProfessionProfileService);

  protected readonly lastLevelUp = signal<XpLogEvent | null>(null);
  private levelUpTimer: ReturnType<typeof setTimeout> | null = null;
  private categoryMap = new Map<string, number>();

  constructor() {
    effect(() => {
      const events = this.logWatcher.recentLevelUps();
      if (events.length === 0) return;
      untracked(() => void this.processLevelUps([...events]));
    });
  }

  async ngOnInit(): Promise<void> {
    this.logWatcher.start();
    const cats = await window.electronAPI.getRecipeCategories();
    for (const cat of cats) {
      const frName = cat.name['fr'];
      if (frName) this.categoryMap.set(frName, cat.id);
    }
  }

  private async processLevelUps(events: XpLogEvent[]): Promise<void> {
    for (const event of events) {
      this.logWatcher.dismissLevelUp(event);
      const categoryId = this.categoryMap.get(event.profession);
      if (categoryId !== undefined) {
        const current = this.professionService.getLevel(categoryId);
        await this.professionService.setLevel(categoryId, current + event.levelsGained);
      }
      this.showLevelUpBanner(event);
    }
  }

  private showLevelUpBanner(event: XpLogEvent): void {
    if (this.levelUpTimer !== null) clearTimeout(this.levelUpTimer);
    this.lastLevelUp.set(event);
    this.levelUpTimer = setTimeout(() => this.lastLevelUp.set(null), 6000);
  }
}
