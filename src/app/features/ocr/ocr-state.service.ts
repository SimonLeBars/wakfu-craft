import { Injectable, signal } from '@angular/core';
import { GridRow } from '@electron';

export interface EditableRow {
  itemId: number | null;
  rarity: number | null;
  nameInput: string;
  price: number | null;
}

@Injectable({ providedIn: 'root' })
export class OcrStateService {
  readonly tableRows  = signal<GridRow[] | null>(null);
  readonly editRows   = signal<EditableRow[]>([]);
  readonly savedCount = signal(0);
  readonly status     = signal('');
}
