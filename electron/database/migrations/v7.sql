-- v7 — lien explicite vers la recette choisie par item de session
ALTER TABLE craft_session_items ADD COLUMN recipe_id INTEGER REFERENCES recipes(id);
