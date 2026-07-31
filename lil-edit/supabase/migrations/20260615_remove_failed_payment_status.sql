-- Remove the 'failed' payment status entirely.
--
-- 'failed' was offered as a payment status but isn't wanted. This migrates any rows that
-- still carry it (pre-launch seed/test data) to 'pending', tightens the CHECK constraints
-- so it can never be stored again, and recreates admin_set_payment_status without the
-- 'failed' transitions. Run AFTER 20260614_payment_status_correction.sql.

-- 1) Migrate away any existing 'failed' values (orders + audit history).
UPDATE orders                 SET payment_status = 'pending' WHERE payment_status = 'failed';
UPDATE payment_status_history SET from_status    = 'pending' WHERE from_status    = 'failed';
UPDATE payment_status_history SET to_status      = 'pending' WHERE to_status      = 'failed';

-- 2) Tighten CHECK constraints so 'failed' can never be stored again.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD  CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending','paid','refunded'));

ALTER TABLE payment_status_history DROP CONSTRAINT IF EXISTS payment_status_history_from_status_check;
ALTER TABLE payment_status_history ADD  CONSTRAINT payment_status_history_from_status_check
  CHECK (from_status IS NULL OR from_status IN ('pending','paid','refunded'));

ALTER TABLE payment_status_history DROP CONSTRAINT IF EXISTS payment_status_history_to_status_check;
ALTER TABLE payment_status_history ADD  CONSTRAINT payment_status_history_to_status_check
  CHECK (to_status IN ('pending','paid','refunded'));

-- 3) Recreate admin_set_payment_status without the 'failed' transitions.
--    Normal flow is now: pending → paid → refunded (refunded terminal). The override
--    path (p_override) still allows any valid status for corrections.
DROP FUNCTION IF EXISTS public.admin_set_payment_status(UUID, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN);

CREATE FUNCTION public.admin_set_payment_status(
  p_order_id    UUID,
  p_status      TEXT,
  p_admin_id    UUID,
  p_admin_name  TEXT,
  p_admin_email TEXT,
  p_note        TEXT    DEFAULT NULL,
  p_override    BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (owner_id UUID, from_status TEXT, result TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_from  TEXT;
  v_owner UUID;
  v_ok    BOOLEAN;
BEGIN
  SELECT payment_status, user_id INTO v_from, v_owner
  FROM orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_from = p_status THEN
    owner_id := v_owner; from_status := v_from; result := 'unchanged';
    RETURN NEXT; RETURN;
  END IF;

  IF p_override THEN
    v_ok := TRUE;
  ELSE
    v_ok := CASE
      WHEN v_from = 'pending' AND p_status = 'paid'     THEN TRUE
      WHEN v_from = 'paid'    AND p_status = 'refunded'  THEN TRUE
      ELSE FALSE                  -- refunded is terminal
    END;
  END IF;

  IF NOT v_ok THEN
    owner_id := v_owner; from_status := v_from; result := 'invalid';
    RETURN NEXT; RETURN;
  END IF;

  UPDATE orders SET payment_status = p_status WHERE id = p_order_id;

  INSERT INTO payment_status_history
    (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email, note, is_correction)
  VALUES
    (p_order_id, v_from, p_status, p_admin_id, p_admin_name, p_admin_email, NULLIF(btrim(p_note), ''), p_override);

  owner_id := v_owner; from_status := v_from; result := 'changed';
  RETURN NEXT;
END;
$$;
