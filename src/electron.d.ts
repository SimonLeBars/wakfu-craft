export interface RecipeIngredient {
  item_id:    number;
  item_name:  Record<string, string>;
  item_level: number;
  item_type:  number;
  quantity:   number;
  hasRecipe:  boolean;
}

export interface Recipe {
  id:          number;
  level:       number;
  category_id: number;
  xp_ratio:    number;
  ingredients: RecipeIngredient[];
}

export interface WakfuItem {
  id:        number;
  name:      Record<string, string>;
  type:      number;
  level:     number;
  hasRecipe: boolean;
}

export interface PriceEntry {
  price:       number;
  recorded_at: string;
}

export interface SessionItem {
  session_item_id: number;
  craft_quantity:  number;
  item_id:         number;
  item_name:       Record<string, string>;
  item_level:      number;
}

export interface ShoppingItem {
  item_id:        number;
  item_name:      Record<string, string>;
  item_level:     number;
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
  searchItems:       (query: string, lang?: string) => Promise<WakfuItem[]>;
  getRecipeByItemId: (itemId: number) => Promise<Recipe | null>;
  setPrice:        (itemId: number, price: number) => Promise<boolean>;
  getLatestPrices: (itemIds: number[]) => Promise<Record<number, number>>;
  getPriceHistory: (itemId: number) => Promise<PriceEntry[]>;
  ocr: {
    startSelection: ()                      => Promise<CaptureRegion | null>;
    capture:        (region: CaptureRegion) => Promise<{ price: number | null; debugImage: string; rawText: string } | null>;
  };
  sessions: {
    getAll:          ()                                              => Promise<CraftSession[]>;
    create:          (name: string)                                  => Promise<number>;
    delete:          (id: number)                                    => Promise<void>;
    getItems:        (id: number)                                    => Promise<SessionItem[]>;
    addItem:         (sessionId: number, itemId: number, qty: number) => Promise<void>;
    removeItem:      (sessionItemId: number)                         => Promise<void>;
    updateQty:       (sessionItemId: number, qty: number)            => Promise<void>;
    getShoppingList: (sessionId: number)                             => Promise<ShoppingItem[]>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
