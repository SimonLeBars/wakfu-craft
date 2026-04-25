export interface RecipeIngredient {
  item_id:    number;
  item_name:  Record<string, string>;
  item_level: number;
  item_type:  number;
  rarity:     number;
  quantity:   number;
  hasRecipe:  boolean;
}

export interface Recipe {
  id:              number;
  level:           number;
  category_id:     number;
  xp_ratio:        number;
  result_quantity: number;
  ingredients:     RecipeIngredient[];
}

export interface ItemType {
  id:        number;
  parent_id: number | null;
  name:      Record<string, string>;
}

export interface WakfuItem {
  id:        number;
  name:      Record<string, string>;
  type:      number;
  level:     number;
  rarity:    number;
  hasRecipe: boolean;
}

export interface PriceEntry {
  price:       number;
  recorded_at: string;
}

export interface SessionItem {
  session_item_id: number;
  craft_quantity:  number;
  result_quantity: number;
  item_id:         number;
  item_name:       Record<string, string>;
  item_level:      number;
  rarity:          number;
  parent_item_id:  number | null;
}

export interface ShoppingItem {
  item_id:        number;
  item_name:      Record<string, string>;
  item_level:     number;
  rarity:         number;
  total_quantity: number;
}

export interface CraftSession {
  id:          number;
  name:        string;
  created_at:  string;
  item_count:  number;
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  checkVersion: () => Promise<{
    remoteVersion: string;
    localVersion: string | null;
    needsUpdate: boolean;
  }>;
  downloadData: () => Promise<{
    version: string;
    results: Record<string, number>;
  }>;
  onSyncProgress: (callback: (data: {
    file: string;
    status: 'downloading' | 'cached' | 'downloaded' | 'imported';
    count?: number;
  }) => void) => void;
  debugReadFile: (filename: string) => Promise<unknown>;
  getItemTypes:      () => Promise<ItemType[]>;
  searchItems:       (query: string, lang?: string, typeIds?: number[], minLevel?: number, maxLevel?: number, rarities?: number[]) => Promise<WakfuItem[]>;
  getRecipeByItemId: (itemId: number) => Promise<Recipe | null>;
  setPrice:        (itemId: number, price: number) => Promise<boolean>;
  getLatestPrices:       (itemIds: number[]) => Promise<Record<number, number>>;
  getLatestPriceEntries: (itemIds: number[]) => Promise<Record<number, PriceEntry>>;
  getPriceHistory: (itemId: number) => Promise<PriceEntry[]>;
  ocr: {
    startSelection: ()                      => Promise<CaptureRegion | null>;
    capture:        (region: CaptureRegion) => Promise<{ price: number | null; debugImage: string; rawText: string } | null>;
  };
  sessions: {
    getAll:          ()                                                                                     => Promise<CraftSession[]>;
    create:          (name: string)                                                                         => Promise<number>;
    rename:          (id: number, name: string)                                                             => Promise<void>;
    delete:          (id: number)                                                                           => Promise<void>;
    getItems:        (id: number)                                                                           => Promise<SessionItem[]>;
    addItem:         (sessionId: number, itemId: number, qty: number, parentId: number | null) => Promise<number>;
    removeItem:      (sessionItemId: number)                                                                => Promise<void>;
    updateQty:       (sessionItemId: number, qty: number)                                                  => Promise<void>;
    getShoppingList: (sessionId: number)                                                                    => Promise<ShoppingItem[]>;
    getCraftOrder:   (sessionId: number)                                                                    => Promise<SessionItem[]>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
