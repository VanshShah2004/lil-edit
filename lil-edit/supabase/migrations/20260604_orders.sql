-- Orders + order_items.
--
-- An order is an immutable snapshot of a checkout: line items copy the product's
-- title/price/image/variant at purchase time, with NO foreign key back to
-- products. That way editing or deleting a product later never mutates or breaks
-- a historical order.
--
-- Placement (cart -> order) is added later with checkout; for now these tables
-- are populated by seed_orders.sql so the /orders pages have data to render.

-- ─── orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number     TEXT          NOT NULL UNIQUE,
  status           TEXT          NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled')),
  payment_method   TEXT          NOT NULL DEFAULT 'cod'
                     CHECK (payment_method IN ('cod','online')),
  payment_status   TEXT          NOT NULL DEFAULT 'pending'
                     CHECK (payment_status IN ('pending','paid','failed','refunded')),
  subtotal         NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_fee     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(10,2) NOT NULL DEFAULT 0,
  item_count       INTEGER       NOT NULL DEFAULT 0,
  -- Snapshot of the shipping address at order time (denormalized so editing the
  -- saved address later doesn't rewrite past orders).
  shipping_address JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx     ON orders (user_id);
CREATE INDEX IF NOT EXISTS orders_created_at_idx  ON orders (created_at DESC);

-- ─── order_items (line snapshot) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_slug  TEXT          NOT NULL,
  category_slug TEXT          NOT NULL DEFAULT '',
  sku           TEXT          NOT NULL,
  title         TEXT          NOT NULL,
  image_url     TEXT          NOT NULL DEFAULT '',
  size          TEXT          NOT NULL DEFAULT '',
  color_name    TEXT          NOT NULL DEFAULT '',
  color_hex     TEXT          NOT NULL DEFAULT '',
  unit_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity      INTEGER       NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  line_total    NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);

-- ─── Row-level security ─────────────────────────────────────────────────────────
-- Customers may READ their own orders only. There are deliberately NO insert/
-- update/delete policies for anon/authenticated, so status, totals and payment
-- state are unforgeable from the browser (same default-deny posture as the
-- catalog + review-verified locks). Order placement runs through the backend
-- service-role client, which bypasses RLS.
ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders: select own" ON orders;
CREATE POLICY "orders: select own"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "order_items: select own" ON order_items;
CREATE POLICY "order_items: select own"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );

-- ─── updated_at trigger ─────────────────────────────────────────────────────────
-- set_updated_at() is shared with cart_items; redefined idempotently so this
-- migration can run standalone.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
