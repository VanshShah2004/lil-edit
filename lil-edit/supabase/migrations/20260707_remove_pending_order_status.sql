-- Drop 'pending' as an order status. Orders have always been created with
-- status='confirmed' (see backend/routes/checkout.ts's place_order call and
-- 20260704_auto_confirm_to_processing.sql), so 'pending' has never actually been
-- written to orders.status — this just tightens the schema/functions to match.
-- (orders.payment_status also has a 'pending' value — that's untouched here.)

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'confirmed';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('confirmed','processing','shipped','delivered','cancelled'));

-- Redefine admin_set_order_status (20260616_order_status_conflict_guard.sql) to
-- drop 'pending' from the allowed-transition source states.
CREATE OR REPLACE FUNCTION public.admin_set_order_status(
  p_order_id        UUID,
  p_status          TEXT,
  p_admin_id        UUID,
  p_admin_name      TEXT,
  p_admin_email     TEXT,
  p_note            TEXT    DEFAULT NULL,
  p_override        BOOLEAN DEFAULT FALSE,
  p_expected_status TEXT    DEFAULT NULL
)
RETURNS TABLE (owner_id UUID, from_status TEXT, result TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_from  TEXT;
  v_owner UUID;
  v_ok    BOOLEAN;
BEGIN
  SELECT status, user_id INTO v_from, v_owner
  FROM orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_from = p_status THEN
    owner_id := v_owner; from_status := v_from; result := 'unchanged';
    RETURN NEXT; RETURN;
  END IF;

  IF p_expected_status IS NOT NULL AND v_from <> p_expected_status THEN
    owner_id := v_owner; from_status := v_from; result := 'conflict';
    RETURN NEXT; RETURN;
  END IF;

  IF p_override THEN
    v_ok := TRUE;
  ELSE
    v_ok := CASE
      WHEN v_from = 'confirmed'   AND p_status IN ('processing','shipped','delivered','cancelled') THEN TRUE
      WHEN v_from = 'processing'  AND p_status IN ('shipped','delivered','cancelled')               THEN TRUE
      WHEN v_from = 'shipped'     AND p_status IN ('delivered','cancelled')                          THEN TRUE
      ELSE FALSE
    END;
  END IF;

  IF NOT v_ok THEN
    owner_id := v_owner; from_status := v_from; result := 'invalid';
    RETURN NEXT; RETURN;
  END IF;

  UPDATE orders SET status = p_status WHERE id = p_order_id;

  INSERT INTO order_status_history
    (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email, note, is_correction)
  VALUES
    (p_order_id, v_from, p_status, p_admin_id, p_admin_name, p_admin_email, NULLIF(btrim(p_note), ''), p_override);

  owner_id := v_owner; from_status := v_from; result := 'changed';
  RETURN NEXT;
END;
$$;
