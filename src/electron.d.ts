export interface RecipeIngredient {
  item_id: number;
  item_name: Record<string, string>;
  item_level: number;
  item_type: number;
  rarity: number;
  quantity: number;
  hasRecipe: boolean;
}

export interface Recipe {
  id: number;
  level: number;
  category_id: number;
  category_name: Record<string, string>;
  xp_ratio: number;
  result_quantity: number;
  ingredients: RecipeIngredient[];
}

export interface ItemType {
  id: number;
  parent_id: number | null;
  name: Record<string, string>;
}

export interface RecipeCategory {
  id: number;
  name: Record<string, string>;
  is_innate: boolean;
}

export interface XpIngredient {
  item_id: number;
  quantity: number;
  item_name: Record<string, string>;
  item_level: number;
  item_type: number;
}

export interface XpRecipe {
  recipe_id: number;
  recipe_level: number;
  xp_ratio: number;
  result_quantity: number;
  category_id: number;
  category_name: Record<string, string>;
  item_id: number;
  item_name: Record<string, string>;
  item_level: number;
  item_type: number;
  rarity: number;
  ingredients: XpIngredient[];
}

export interface WakfuItem {
  id: number;
  name: Record<string, string>;
  type: number;
  level: number;
  rarity: number;
  hasRecipe: boolean;
}

export interface PriceEntry {
  id: number;
  price: number;
  recorded_at: string;
  not_for_sale: boolean;
}

export interface SessionItem {
  session_item_id: number;
  craft_quantity: number;
  result_quantity: number;
  item_id: number;
  item_name: Record<string, string>;
  item_level: number;
  rarity: number;
  recipe_id: number | null;
}

export interface ShoppingItem {
  item_id: number;
  item_name: Record<string, string>;
  item_level: number;
  rarity: number;
  total_quantity: number;
}

export interface BoughtIngredient {
  item_id: number;
  item_name: Record<string, string>;
  item_level: number;
  rarity: number;
  quantity: number;
}

export interface RecipeTreeNode {
  session_item_id: number;
  item_id: number;
  item_name: Record<string, string>;
  item_level: number;
  rarity: number;
  craft_quantity: number;
  result_quantity: number;
  recipe_id: number | null;
  bought_ingredients: BoughtIngredient[];
  children: RecipeTreeNode[];
}

export type SessionStep = 'preparation' | 'purchase' | 'craft' | 'listing' | 'sale';

export interface CraftSession {
  id: number;
  name: string;
  created_at: string;
  item_count: number;
  step: SessionStep;
}

export interface SessionPurchase {
  id: number;
  session_id: number;
  item_id: number;
  item_name: Record<string, string>;
  unit_price: number;
  quantity: number;
  purchased_at: string;
}

export interface SessionCraftDone {
  id: number;
  session_item_id: number;
  quantity_crafted: number;
  crafted_at: string;
}

export interface SessionListing {
  id: number;
  session_item_id: number;
  parent_listing_id: number | null;
  unit_price: number;
  quantity: number;
  tax_rate: number;
  listed_at: string;
  tax_amount: number;
  quantity_sold: number;
  quantity_remaining: number;
}

export interface SessionSale {
  id: number;
  listing_id: number;
  quantity: number;
  sold_at: string;
}

export interface SessionReportItem {
  item_id: number;
  item_name: Record<string, string>;
  quantity_crafted: number;
  quantity_sold: number;
  quantity_remaining: number;
  first_listed_at: string | null;
  last_sold_at: string | null;
  days_to_sell: number | null;
}

export interface SessionReport {
  total_real_cost: number;
  total_tax_paid: number;
  total_revenue: number;
  net_profit: number;
  items: SessionReportItem[];
}

export interface GridConfig {
  x: number;
  y: number;
  colWidths: number[];
  rowHeights: number[];
}

export interface GridRow {
  name: string;
  level: number | null;
  quantity: number | null;
  price: number | null;
  debugImages: [string, string, string, string];
  rawTexts: [string, string, string, string];
  stageImages?: { label: string; src: string }[][];
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
  onSyncProgress: (
    callback: (data: {
      file: string;
      status: 'downloading' | 'cached' | 'downloaded' | 'imported';
      count?: number;
    }) => void,
  ) => void;
  debugReadFile: (filename: string) => Promise<unknown>;
  getItemTypes: () => Promise<ItemType[]>;
  getRecipeCategories: () => Promise<RecipeCategory[]>;
  getProfessionLevels: () => Promise<Record<number, number>>;
  setProfessionLevels: (levels: Record<number, number>) => Promise<void>;
  getGuildXpBonus: () => Promise<number>;
  setGuildXpBonus: (bonus: number) => Promise<void>;
  getRecipesByCategoryAndLevel: (
    categoryId: number,
    minLevel: number,
    maxLevel: number,
  ) => Promise<XpRecipe[]>;
  getRecipesByItemIds: (itemIds: number[]) => Promise<XpRecipe[]>;
  searchItems: (
    query: string,
    lang?: string,
    typeIds?: number[],
    minLevel?: number,
    maxLevel?: number,
    rarities?: number[],
  ) => Promise<WakfuItem[]>;
  getRecipesByItemId: (itemId: number) => Promise<Recipe[]>;
  setPrice: (itemId: number, price: number) => Promise<boolean>;
  setNotForSale: (itemId: number) => Promise<boolean>;
  getLatestPrices: (itemIds: number[]) => Promise<Record<number, number>>;
  getLatestPriceEntries: (itemIds: number[]) => Promise<Record<number, PriceEntry>>;
  getPriceHistory: (itemId: number) => Promise<PriceEntry[]>;
  deletePriceEntry: (id: number) => Promise<void>;
  ocr: {
    openGridOverlay: (config?: GridConfig) => Promise<GridConfig | null>;
    captureGrid: (grid: GridConfig) => Promise<GridRow[] | null>;
  };
  sessions: {
    getAll: () => Promise<CraftSession[]>;
    create: (name: string) => Promise<number>;
    rename: (id: number, name: string) => Promise<void>;
    delete: (id: number) => Promise<void>;
    getItems: (id: number) => Promise<SessionItem[]>;
    getTree: (id: number) => Promise<RecipeTreeNode[]>;
    addItem: (
      sessionId: number,
      itemId: number,
      qty: number,
      recipeId: number | null,
      subRecipes: Record<number, number>,
    ) => Promise<number>;
    removeItem: (sessionItemId: number) => Promise<void>;
    updateQty: (sessionItemId: number, qty: number) => Promise<void>;
    setStep: (id: number, step: SessionStep) => Promise<void>;
    getPurchases: (sessionId: number) => Promise<SessionPurchase[]>;
    addPurchase: (
      sessionId: number,
      itemId: number,
      unitPrice: number,
      quantity: number,
    ) => Promise<number>;
    deletePurchase: (id: number) => Promise<void>;
    getCraftsDone: (sessionId: number) => Promise<SessionCraftDone[]>;
    upsertCraftDone: (sessionItemId: number, qty: number) => Promise<void>;
    getListings: (sessionId: number) => Promise<SessionListing[]>;
    addListing: (
      sessionItemId: number,
      parentListingId: number | null,
      unitPrice: number,
      quantity: number,
      taxRate: number,
    ) => Promise<number>;
    deleteListing: (id: number) => Promise<void>;
    getSales: (sessionId: number) => Promise<SessionSale[]>;
    addSale: (listingId: number, quantity: number, soldAt?: string) => Promise<number>;
    getReport: (sessionId: number) => Promise<SessionReport>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
