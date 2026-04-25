-- v5 — catégories de recettes (métiers de craft)

CREATE TABLE IF NOT EXISTS recipe_categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  is_innate INTEGER NOT NULL DEFAULT 0
);

DELETE FROM settings WHERE key = 'gamedata_version';
