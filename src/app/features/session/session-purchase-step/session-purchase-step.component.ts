import {
  Component,
  OnInit,
  inject,
  computed,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { SessionService } from '@services/session.service';
import { SessionPurchase } from '@electron';
import { CopyBtnComponent } from '@shared/components/copy-btn.component';

interface PurchaseForm {
  qty: number;
  price: number;
}

@Component({
  selector: 'app-session-purchase-step',
  imports: [FormsModule, DecimalPipe, DatePipe, CopyBtnComponent],
  templateUrl: './session-purchase-step.component.html',
  styleUrl: './session-purchase-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionPurchaseStepComponent implements OnInit {
  protected readonly sessionService = inject(SessionService);

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
