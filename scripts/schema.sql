-- =============================================================
--  schema.sql  –  Product catalog schema
--
--  Run via:  npm run schema
--            (or psql -d products_db -f scripts/schema.sql)
-- =============================================================

-- ---------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          BIGSERIAL       PRIMARY KEY,
  name        TEXT            NOT NULL,
  category    TEXT            NOT NULL,
  price       NUMERIC(10, 2)  NOT NULL,
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Indexes
--
-- Two composite indexes cover every query pattern:
--
--   1. Unfiltered browse (no category):
--      (created_at DESC, id DESC) — pure index scan, O(log N)
--
--   2. Category-filtered browse:
--      (category, created_at DESC, id DESC)
--      — equality on category, then keyset within that bucket.
--
-- Both support keyset pagination without touching any extra rows.
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_created_id
    ON products (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_cat_created_id
    ON products (category, created_at DESC, id DESC);
