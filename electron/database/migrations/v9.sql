-- v9 — étapes de session : achats, crafts effectués, mises en vente, ventes

ALTER TABLE craft_sessions ADD COLUMN step TEXT NOT NULL DEFAULT 'preparation';
-- Valeurs : 'preparation' | 'purchase' | 'craft' | 'listing' | 'sale'

-- Achats d'ingrédients (plusieurs lignes possibles par ingrédient à des prix différents)
CREATE TABLE session_purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES craft_sessions(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES items(id),
  unit_price   INTEGER NOT NULL,
  quantity     INTEGER NOT NULL,
  purchased_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Crafts effectués (un seul enregistrement par item crafté, mis à jour par UPSERT)
CREATE TABLE session_crafts_done (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER NOT NULL REFERENCES craft_sessions(id) ON DELETE CASCADE,
  item_id          INTEGER NOT NULL REFERENCES items(id),
  quantity_crafted INTEGER NOT NULL,
  crafted_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, item_id)
);

-- Mises en vente (parent_listing_id renseigné lors d'une re-mise en vente)
CREATE TABLE session_listings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_item_id   INTEGER NOT NULL REFERENCES craft_session_items(id) ON DELETE CASCADE,
  parent_listing_id INTEGER REFERENCES session_listings(id),
  unit_price        INTEGER NOT NULL,
  quantity          INTEGER NOT NULL,
  tax_rate          REAL NOT NULL DEFAULT 0,
  listed_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ventes (une ligne par événement de vente, partielle ou totale)
CREATE TABLE session_sales (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES session_listings(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL,
  sold_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
