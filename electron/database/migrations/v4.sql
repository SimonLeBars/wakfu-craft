-- v4 — types d'items + correction du stockage de items.type (TEXT '306.0' → INTEGER)

CREATE TABLE IF NOT EXISTS item_types (
  id        INTEGER PRIMARY KEY,
  parent_id INTEGER,
  name      TEXT NOT NULL
);

-- Recrée items avec type INTEGER au lieu de TEXT
CREATE TABLE items_new (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  type     INTEGER,
  level    INTEGER,
  raw_data TEXT
);
INSERT INTO items_new SELECT id, name, CAST(type AS INTEGER), level, raw_data FROM items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

DELETE FROM settings WHERE key = 'gamedata_version';
