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
import { DecimalPipe, DatePipe } from '@angular/common';
import { SessionService } from '@services/session.service';
import { LogWatcherService } from '@services/log-watcher.service';
import { SessionPurchase, GameLogEvent } from '@electron';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';
import { RarityColorPipe } from '@shared/pipes/rarity-color.pipe';
import { RarityLabelPipe } from '@shared/pipes/rarity-label.pipe';

interface PurchaseForm {
  qty: number;
  price: number;
}

@Component({
  selector: 'app-session-purchase-step',
  imports: [FormsModule, DecimalPipe, DatePipe, CopyBtnComponent, RarityColorPipe, RarityLabelPipe],
  templateUrl: './session-purchase-step.component.html',
  styleUrl: './session-purchase-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionPurchaseStepComponent implements OnInit {
  protected readonly sessionService = inject(SessionService);
  private readonly logWatcher = inject(LogWatcherService);

  protected readonly purchasesByItem = computed(() =>
    this.sessionService.purchases().reduce((map, p) => {
      map.set(p.item_id, [...(map.get(p.item_id) ?? []), p]);
      return map;
    }, new Map<number, SessionPurchase[]>()),
  );

  protected readonly totalSpent = computed(() =>
    this.sessionService.purchases().reduce((sum, p) => sum + p.unit_price * p.quantity, 0),
  );

  protected readonly forms = signal<Record<number, PurchaseForm>>({});

  protected readonly lastAutoRecorded = signal<GameLogEvent | null>(null);
  private autoRecordTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly matchedLogEvents = computed(() =>
    this.logWatcher
      .recentPurchases()
      .filter((e) =>
        this.sessionService.shoppingList().some((i) => i.item_name['fr'] === e.itemName),
      ),
  );

  constructor() {
    effect(() => {
      const events = this.matchedLogEvents();
      if (events.length === 0) return;
      // untracked() évite qu'Angular suive les écritures de signaux
      // (dismiss, forms.update) déclenchées depuis cet effect
      untracked(() => void this.processAutoEvents([...events]));
    });
  }

  private async processAutoEvents(events: GameLogEvent[]): Promise<void> {
    for (const event of events) {
      const item = this.sessionService
        .shoppingList()
        .find((i) => i.item_name['fr'] === event.itemName);
      if (!item) continue;
      this.logWatcher.dismiss(event);
      await this.sessionService.addPurchase(item.item_id, event.unitPrice, event.quantity);
      const bought = this.getBought(item.item_id);
      const remaining = Math.max(1, item.total_quantity - bought);
      this.forms.update((f) => ({
        ...f,
        [item.item_id]: { qty: remaining, price: f[item.item_id]?.price ?? event.unitPrice },
      }));
      this.showAutoRecordedBanner(event);
    }
  }

  private showAutoRecordedBanner(event: GameLogEvent): void {
    if (this.autoRecordTimer !== null) clearTimeout(this.autoRecordTimer);
    this.lastAutoRecorded.set(event);
    this.autoRecordTimer = setTimeout(() => this.lastAutoRecorded.set(null), 5000);
  }

  async ngOnInit(): Promise<void> {
    await this.sessionService.loadPurchases();

    const itemIds = this.sessionService.shoppingList().map((i) => i.item_id);
    const lastPrices = itemIds.length > 0 ? await window.electronAPI.getLatestPrices(itemIds) : {};

    const initial: Record<number, PurchaseForm> = {};
    for (const item of this.sessionService.shoppingList()) {
      const bought = this.getBought(item.item_id);
      initial[item.item_id] = {
        qty: Math.max(1, item.total_quantity - bought),
        price: lastPrices[item.item_id] ?? 0,
      };
    }
    this.forms.set(initial);
  }

  protected getBought(itemId: number): number {
    return (this.purchasesByItem().get(itemId) ?? []).reduce((s, p) => s + p.quantity, 0);
  }

  protected getCoverage(itemId: number, needed: number): 'full' | 'partial' | 'none' {
    const bought = this.getBought(itemId);
    if (bought >= needed) return 'full';
    if (bought > 0) return 'partial';
    return 'none';
  }

  protected isAddDisabled(itemId: number): boolean {
    const form = this.forms()[itemId];
    if (!form || form.qty <= 0 || form.price <= 0) return true;
    const item = this.sessionService.shoppingList().find((i) => i.item_id === itemId);
    return !!item && this.getBought(itemId) >= item.total_quantity;
  }

  protected updateQty(itemId: number, value: number): void {
    this.forms.update((f) => ({ ...f, [itemId]: { qty: value, price: f[itemId]?.price ?? 0 } }));
  }

  protected updatePrice(itemId: number, value: number): void {
    this.forms.update((f) => ({ ...f, [itemId]: { qty: f[itemId]?.qty ?? 1, price: value } }));
  }

  protected async onAddPurchase(itemId: number): Promise<void> {
    const form = this.forms()[itemId];
    if (!form || form.qty <= 0 || form.price <= 0) return;
    await this.sessionService.addPurchase(itemId, form.price, form.qty);
    const item = this.sessionService.shoppingList().find((i) => i.item_id === itemId);
    const bought = this.getBought(itemId);
    const remaining = item ? Math.max(1, item.total_quantity - bought) : 1;
    this.forms.update((f) => ({ ...f, [itemId]: { qty: remaining, price: form.price } }));
  }

  protected async onDeletePurchase(id: number): Promise<void> {
    await this.sessionService.deletePurchase(id);
  }

  protected async onNextStep(): Promise<void> {
    await this.sessionService.setStep('craft');
  }
}
