-- v10 — correction session_crafts_done : clé (session_id, item_id) au lieu de session_item_id
-- Les sous-crafts n'ont pas de craft_session_items row (session_item_id=0), la FK précédente échouait.

DROP TABLE IF EXISTS session_crafts_done;

CREATE TABLE session_crafts_done (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER NOT NULL REFERENCES craft_sessions(id) ON DELETE CASCADE,
  item_id          INTEGER NOT NULL REFERENCES items(id),
  quantity_crafted INTEGER NOT NULL,
  crafted_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, item_id)
);
