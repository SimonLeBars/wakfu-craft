-- v2 — lien parent/enfant entre items craftés
ALTER TABLE craft_session_items ADD COLUMN parent_item_id INTEGER REFERENCES craft_session_items(id) ON DELETE CASCADE;
