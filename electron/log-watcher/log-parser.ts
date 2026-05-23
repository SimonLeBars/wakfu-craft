import { GameLogEvent } from '@electron';

// Kamas spent (purchase payment line comes before item received)
const PERDU_KAMAS_RE =
  /^(\d{2}:\d{2}:\d{2}),\d+ - \[Information \(jeu\)\] Vous avez perdu ([\d\u00A0\s]+) kamas\.$/u;

// Item received from HDV purchase
const RAMASSE_ITEM_RE =
  /^(\d{2}:\d{2}:\d{2}),\d+ - \[Information \(jeu\)\] Vous avez ramassé (\d+)x (.+?) \.$/u;

export interface PendingKamas {
  kamas: number;
  timestamp: string;
}

export interface ParseResult {
  pending: PendingKamas | null;
  emit?: GameLogEvent;
}

export function parseLine(line: string, pending: PendingKamas | null): ParseResult {
  const kamasMatch = PERDU_KAMAS_RE.exec(line);
  if (kamasMatch) {
    const raw = kamasMatch[2].replace(/[\u00A0\s]/g, '');
    return { pending: { kamas: parseInt(raw, 10), timestamp: kamasMatch[1] } };
  }

  const ramasseMatch = RAMASSE_ITEM_RE.exec(line);
  if (ramasseMatch && pending) {
    const qty = parseInt(ramasseMatch[2], 10);
    const event: GameLogEvent = {
      itemName: ramasseMatch[3],
      quantity: qty,
      totalKamas: pending.kamas,
      unitPrice: Math.round(pending.kamas / qty),
      timestamp: ramasseMatch[1],
    };
    return { pending: null, emit: event };
  }

  // Any other line breaks the pending pair
  return { pending: null };
}
