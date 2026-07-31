-- Cart items table: one row per (user, sku, size) combination.
-- Duplicate adds increment quantity instead of inserting a second row.

CREATE TABLE IF NOT EXISTS cart_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_slug TEXT        NOT NULL,
  sku          TEXT        NOT NULL,
  size         TEXT        NOT NULL DEFAULT '',
  quantity     INTEGER     NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cart_items_user_sku_size_key UNIQUE (user_id, sku, size)
);

CREATE INDEX IF NOT EXISTS cart_items_user_id_idx ON cart_items (user_id);

-- Row-level security: each user can only see and modify their own rows.
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cart: select own"
  ON cart_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "cart: insert own"
  ON cart_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cart: update own"
  ON cart_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "cart: delete own"
  ON cart_items FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at on every row change.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cart_items_set_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
