-- Payment-status correction (override).
--
-- Mirrors the order-status correction (20260613): an admin can fix a mistaken payment
-- status from ANY state — including out of the terminal `refunded` — through a guarded
-- override. p_override = TRUE bypasses the normal payment transition machine, records
-- the row with is_correction = TRUE, and stays fully audited. The orders.payment_status
-- CHECK constraint still guards the target value. The function is dropped and recreated
-- because its body/flag change.

ALTER TABLE payment_status_history ADD COLUMN IF NOT EXISTS is_correction BOOLEAN NOT NULL DEFAULT FALSE;

DROP FUNCTION IF EXISTS public.admin_set_payment_status(UUID, TEXT, UUID, TEXT, TEXT, TEXT);

CREATE FUNCTION public.admin_set_payment_status(
  p_order_id    UUID,
  p_status      TEXT,
  p_admin_id    UUID,
  p_admin_name  TEXT,
  p_admin_email TEXT,
  p_note        TEXT    DEFAULT NULL,
  p_override    BOOLEAN DEFAULT FALSE
)
-- result ∈ ('changed','unchanged','invalid'); zero rows ⇒ order not found.
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
    RETURN;                       -- no rows → caller treats as 404
  END IF;

  -- No-op: report current state, touch nothing.
  IF v_from = p_status THEN
    owner_id := v_owner; from_status := v_from; result := 'unchanged';
    RETURN NEXT; RETURN;
  END IF;

  IF p_override THEN
    -- Correction: allow moving to any other valid payment status, incl. out of
    -- `refunded`. The payment_status CHECK constraint still rejects bogus values.
    v_ok := TRUE;
  ELSE
    v_ok := CASE
      WHEN v_from = 'pending' AND p_status IN ('paid','failed')   THEN TRUE
      WHEN v_from = 'failed'  AND p_status IN ('paid','pending')  THEN TRUE
      WHEN v_from = 'paid'    AND p_status = 'refunded'           THEN TRUE
      ELSE FALSE                  -- refunded is terminal in the normal flow
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
