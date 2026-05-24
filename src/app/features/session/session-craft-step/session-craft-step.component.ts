import {
  Component,
  OnInit,
  inject,
  computed,
  signal,
  effect,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { SessionService } from '@services/session.service';
import { ProfessionProfileService } from '@services/profession-profile.service';
import { LogWatcherService } from '@services/log-watcher.service';
import { CraftLogEvent } from '@electron';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';

@Component({
  selector: 'app-session-craft-step',
  imports: [FormsModule, DatePipe, DecimalPipe, CopyBtnComponent, RarityColorPipe, RarityLabelPipe],
  templateUrl: './session-craft-step.component.html',
  styleUrl: './session-craft-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionCraftStepComponent implements OnInit {
  protected readonly sessionService = inject(SessionService);
  protected readonly professionService = inject(ProfessionProfileService);
  private readonly logWatcher = inject(LogWatcherService);

  protected readonly lastAutoCrafted = signal<CraftLogEvent | null>(null);
  private autoCraftTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly matchedCraftEvents = computed(() =>
    this.logWatcher
      .recentCrafts()
      .filter((e) =>
        this.sessionService.craftOrder().some((n) => n.item_name['fr'] === e.itemName),
      ),
  );

  constructor() {
    effect(() => {
      const levels = this.professionService.levels();
      const cats = this.relevantCategories();
      untracked(() => {
        this.levelForms.update((f) => {
          const next = { ...f };
          for (const cat of cats) next[cat.id] = levels[cat.id] ?? 1;
          return next;
        });
      });
    });

    effect(() => {
      const events = this.matchedCraftEvents();
      if (events.length === 0) return;
      untracked(() => void this.processAutoCrafts([...events]));
    });
  }

  private async processAutoCrafts(events: CraftLogEvent[]): Promise<void> {
    for (const event of events) {
      const node = this.sessionService
        .craftOrder()
        .find((n) => n.item_name['fr'] === event.itemName);
      if (!node) continue;
      this.logWatcher.dismissCraft(event);
      const current = this.craftsDoneMap().get(node.item_id);
      const newQty = (current?.quantity_crafted ?? 0) + event.quantity;
      await this.sessionService.upsertCraftDone(node.item_id, newQty);
      this.forms.update((f) => ({ ...f, [node.item_id]: newQty }));
      this.showAutoCraftBanner(event);
    }
  }

  private showAutoCraftBanner(event: CraftLogEvent): void {
    if (this.autoCraftTimer !== null) clearTimeout(this.autoCraftTimer);
    this.lastAutoCrafted.set(event);
    this.autoCraftTimer = setTimeout(() => this.lastAutoCrafted.set(null), 5000);
  }

  protected readonly craftsDoneMap = computed(() =>
    this.sessionService.craftsDone().reduce((map, c) => {
      map.set(c.item_id, c);
      return map;
    }, new Map()),
  );

  protected readonly forms = signal<Partial<Record<number, number>>>({});
  protected readonly levelForms = signal<Partial<Record<number, number>>>({});

  protected readonly relevantCategories = computed(() => {
    const seen = new Set<number>();
    const result: { id: number; name: Record<string, string> }[] = [];
    for (const node of this.sessionService.craftOrder()) {
      if (node.category_id != null && node.category_name != null && !seen.has(node.category_id)) {
        seen.add(node.category_id);
        result.push({ id: node.category_id, name: node.category_name });
      }
    }
    return result;
  });

  protected readonly fullyDoneCount = computed(
    () =>
      this.sessionService.craftOrder().filter((node) => {
        const done = this.craftsDoneMap().get(node.item_id);
        return done && done.quantity_crafted >= node.craft_quantity;
      }).length,
  );

  async ngOnInit(): Promise<void> {
    await this.sessionService.loadCraftsDone();
    const initial: Record<number, number> = {};
    for (const node of this.sessionService.craftOrder()) {
      const done = this.craftsDoneMap().get(node.item_id);
      initial[node.item_id] = done ? done.quantity_crafted : node.craft_quantity;
    }
    this.forms.set(initial);
  }

  protected getCoverage(itemId: number, craftQty: number): 'full' | 'partial' | 'none' {
    const done = this.craftsDoneMap().get(itemId);
    if (!done) return 'none';
    if (done.quantity_crafted >= craftQty) return 'full';
    return 'partial';
  }

  protected isSubmitDisabled(itemId: number, craftQty: number): boolean {
    const qty = this.forms()[itemId] ?? craftQty;
    if (qty <= 0) return true;
    const done = this.craftsDoneMap().get(itemId);
    return !!done && done.quantity_crafted === qty;
  }

  protected updateForm(itemId: number, value: number): void {
    this.forms.update((f) => ({ ...f, [itemId]: value }));
  }

  protected async onValidate(itemId: number): Promise<void> {
    const qty = this.forms()[itemId] ?? 0;
    if (qty <= 0) return;
    await this.sessionService.upsertCraftDone(itemId, qty);
  }

  protected isLevelSaveDisabled(categoryId: number): boolean {
    const current = this.professionService.getLevel(categoryId);
    const value = this.levelForms()[categoryId] ?? current;
    return value <= 0 || value > 200 || value === current;
  }

  protected updateLevelForm(categoryId: number, value: number): void {
    this.levelForms.update((f) => ({ ...f, [categoryId]: value }));
  }

  protected stepLevel(categoryId: number, delta: number): void {
    const current = this.levelForms()[categoryId] ?? this.professionService.getLevel(categoryId);
    const next = Math.min(200, Math.max(1, current + delta));
    this.updateLevelForm(categoryId, next);
  }

  protected async onSaveLevel(categoryId: number): Promise<void> {
    const level = this.levelForms()[categoryId];
    if (level === undefined || level <= 0 || level > 200) return;
    await this.professionService.setLevel(categoryId, level);
  }

  protected async onNextStep(): Promise<void> {
    await this.sessionService.setStep('listing');
  }
}
