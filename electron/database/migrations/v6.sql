-- v6 — statut "pas en vente" dans l'historique des prix

ALTER TABLE price_history ADD COLUMN not_for_sale INTEGER NOT NULL DEFAULT 0;
