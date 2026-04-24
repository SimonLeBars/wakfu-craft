-- v3 — quantité produite par recette
ALTER TABLE recipes ADD COLUMN result_quantity INTEGER NOT NULL DEFAULT 1;
DELETE FROM settings WHERE key = 'gamedata_version';
