-- Wishlist items: one row per (user, product_slug, sku).
-- Duplicate adds are silently ignored via the unique constraint.

CREATE TABLE IF NOT EXISTS wishlist_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_slug TEXT        NOT NULL,
  sku          TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wishlist_items_user_slug_sku_key UNIQUE (user_id, product_slug, sku)
);

CREATE INDEX IF NOT EXISTS wishlist_items_user_id_idx ON wishlist_items (user_id);

-- Row-level security: each user can only see and modify their own rows.
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wishlist: select own"
  ON wishlist_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "wishlist: insert own"
  ON wishlist_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wishlist: delete own"
  ON wishlist_items FOR DELETE
  USING (auth.uid() = user_id);
