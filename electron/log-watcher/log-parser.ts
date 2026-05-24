import { GameLogEvent, CraftLogEvent, XpLogEvent } from '@electron';

// Purchase: kamas lost first (no "x", no item name)
const PERDU_KAMAS_RE =
  /^(\d{2}:\d{2}:\d{2}),\d+ - \[Information \(jeu\)\] Vous avez perdu ([\d \s]+) kamas\.$/u;

// Item received — from HDV purchase OR as craft result
const RAMASSE_ITEM_RE =
  /^(\d{2}:\d{2}:\d{2}),\d+ - \[Information \(jeu\)\] Vous avez ramassé (\d+)x (.+?) \.$/u;

// XP gained from any profession (craft, harvest, etc.); level-up optional
const XP_LINE_RE =
  /^(\d{2}:\d{2}:\d{2}),\d+ - \[Information \(jeu\)\] (.+?) : \+([\d \s]+) points d'XP\.(?:\s+\+(\d+) niveau\.)? Prochain niveau dans/u;

// Ingredient consumed during craft ("Nx" distinguishes it from kamas loss)
const PERDU_ITEM_RE =
  /^(\d{2}:\d{2}:\d{2}),\d+ - \[Information \(jeu\)\] Vous avez perdu \d+x .+ \.$/u;

// Craft success confirmation
const REUSSI_RECETTE_RE =
  /^(\d{2}:\d{2}:\d{2}),\d+ - \[Information \(jeu\)\] Vous avez réussi votre recette de (.+?)\.$/u;

export interface PendingKamas {
  kamas: number;
  timestamp: string;
}

export interface PendingCraft {
  profession: string;
  xpGained: number;
  levelsGained: number;
  itemName: string | null;
  quantity: number;
  timestamp: string;
}

export interface ParseResult {
  pendingKamas: PendingKamas | null;
  pendingCraft: PendingCraft | null;
  emit?: GameLogEvent;
  emitCraft?: CraftLogEvent;
  emitXp?: XpLogEvent;
}

export function parseLine(
  line: string,
  pendingKamas: PendingKamas | null,
  pendingCraft: PendingCraft | null,
): ParseResult {
  // 1. XP gain → emit XpLogEvent immediately + start craft state
  const xpMatch = XP_LINE_RE.exec(line);
  if (xpMatch) {
    const rawXp = xpMatch[3].replace(/[ \s]/g, '');
    const xpGained = parseInt(rawXp, 10);
    const levelsGained = xpMatch[4] ? parseInt(xpMatch[4], 10) : 0;
    return {
      pendingKamas: null,
      pendingCraft: {
        profession: xpMatch[2],
        xpGained,
        levelsGained,
        itemName: null,
        quantity: 0,
        timestamp: xpMatch[1],
      },
      emitXp: { profession: xpMatch[2], xpGained, levelsGained, timestamp: xpMatch[1] },
    };
  }

  // 2. Kamas lost → purchase payment (breaks any pending craft)
  const kamasMatch = PERDU_KAMAS_RE.exec(line);
  if (kamasMatch) {
    const raw = kamasMatch[2].replace(/[ \s]/g, '');
    return {
      pendingKamas: { kamas: parseInt(raw, 10), timestamp: kamasMatch[1] },
      pendingCraft: null,
    };
  }

  // 3. Ingredient consumed → keep craft state alive, reset kamas state
  if (PERDU_ITEM_RE.test(line)) {
    return { pendingKamas: null, pendingCraft };
  }

  // 4. Item received → craft result OR purchase result
  const ramasseMatch = RAMASSE_ITEM_RE.exec(line);
  if (ramasseMatch) {
    const qty = parseInt(ramasseMatch[2], 10);
    const itemName = ramasseMatch[3];

    if (pendingCraft) {
      return {
        pendingKamas: null,
        pendingCraft: { ...pendingCraft, itemName, quantity: qty },
      };
    }

    if (pendingKamas) {
      const event: GameLogEvent = {
        itemName,
        quantity: qty,
        totalKamas: pendingKamas.kamas,
        unitPrice: Math.round(pendingKamas.kamas / qty),
        timestamp: ramasseMatch[1],
      };
      return { pendingKamas: null, pendingCraft: null, emit: event };
    }

    return { pendingKamas: null, pendingCraft: null };
  }

  // 5. Craft success → emit craft event
  const reussiMatch = REUSSI_RECETTE_RE.exec(line);
  if (reussiMatch && pendingCraft) {
    const event: CraftLogEvent = {
      itemName: pendingCraft.itemName ?? reussiMatch[2],
      quantity: pendingCraft.quantity || 1,
      profession: pendingCraft.profession,
      xpGained: pendingCraft.xpGained,
      levelsGained: pendingCraft.levelsGained,
      timestamp: pendingCraft.timestamp,
    };
    return { pendingKamas: null, pendingCraft: null, emitCraft: event };
  }

  // Any other line resets both states
  return { pendingKamas: null, pendingCraft: null };
}
