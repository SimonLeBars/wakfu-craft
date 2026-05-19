DROP TABLE IF EXISTS craft_session_items;

CREATE TABLE craft_session_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES craft_sessions(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  quantity    INTEGER NOT NULL DEFAULT 1,
  recipe_id   INTEGER REFERENCES recipes(id)
);

CREATE TABLE craft_session_sub_recipes (
  session_item_id  INTEGER NOT NULL REFERENCES craft_session_items(id) ON DELETE CASCADE,
  item_id          INTEGER NOT NULL REFERENCES items(id),
  recipe_id        INTEGER NOT NULL REFERENCES recipes(id),
  PRIMARY KEY (session_item_id, item_id)
);
