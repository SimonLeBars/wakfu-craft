import { Component, OnInit, inject, effect, ChangeDetectionStrategy } from '@angular/core';
import { SessionService } from '@services/session.service';
import { PriceService } from '@services/price.service';
import { ProfessionProfileService } from '@services/profession-profile.service';
import { SessionListComponent } from './session-list/session-list.component';
import { SessionPlannedCraftsComponent } from './session-planned-crafts/session-planned-crafts.component';
import { SessionShoppingListComponent } from './session-shopping-list/session-shopping-list.component';
import { SessionProfitabilityComponent } from './session-profitability/session-profitability.component';
import { SessionCraftOrderComponent } from './session-craft-order/session-craft-order.component';
import { SessionStepIndicatorComponent } from './session-step-indicator/session-step-indicator.component';
import { SessionPurchaseStepComponent } from './session-purchase-step/session-purchase-step.component';
import { SessionCraftStepComponent } from './session-craft-step/session-craft-step.component';
import { SessionListingStepComponent } from './session-listing-step/session-listing-step.component';
import { SessionSaleStepComponent } from './session-sale-step/session-sale-step.component';

@Component({
  selector: 'app-session',
  imports: [
    SessionListComponent,
    SessionPlannedCraftsComponent,
    SessionShoppingListComponent,
    SessionProfitabilityComponent,
    SessionCraftOrderComponent,
    SessionStepIndicatorComponent,
    SessionPurchaseStepComponent,
    SessionCraftStepComponent,
    SessionListingStepComponent,
    SessionSaleStepComponent,
  ],
  templateUrl: './session.component.html',
  styleUrl: './session.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionComponent implements OnInit {
  protected readonly sessionService = inject(SessionService);
  private readonly priceService = inject(PriceService);
  private readonly profile = inject(ProfessionProfileService);

  constructor() {
    effect(() => {
      const shoppingIds = this.sessionService.shoppingList().map((i) => i.item_id);
      const sessionIds = this.sessionService.sessionItems().map((i) => i.item_id);
      const ids = [...new Set([...shoppingIds, ...sessionIds])];
      if (ids.length > 0) this.priceService.loadPricesForItems(ids);
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.sessionService.loadSessions(), this.profile.load()]);
  }

  protected async onStartPurchase(): Promise<void> {
    await this.sessionService.setStep('purchase');
  }
}
