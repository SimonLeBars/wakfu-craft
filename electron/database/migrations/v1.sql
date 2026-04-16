-- v1 — schéma initial

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT,
  level       INTEGER,
  raw_data    TEXT
);

CREATE TABLE IF NOT EXISTS recipes (
  id             INTEGER PRIMARY KEY,
  result_item_id INTEGER,
  category_id    INTEGER,
  level          INTEGER,
  xp_ratio       INTEGER,
  raw_data       TEXT
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id   INTEGER NOT NULL,
  item_id     INTEGER NOT NULL,
  quantity    INTEGER NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id),
  FOREIGN KEY (item_id)   REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL,
  price       REAL NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS latest_prices AS
SELECT item_id, price, recorded_at
FROM price_history p1
WHERE recorded_at = (
  SELECT MAX(recorded_at) FROM price_history p2 WHERE p2.item_id = p1.item_id
);

CREATE TABLE IF NOT EXISTS craft_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT 'Session',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS craft_session_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  item_id    INTEGER NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (session_id) REFERENCES craft_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id)    REFERENCES items(id)
);
