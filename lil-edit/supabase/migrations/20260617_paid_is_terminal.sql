-- Make `paid` a terminal payment status in the normal flow.
--
-- Previous machine: pending → paid → refunded (refunded terminal)
-- New machine:      pending → paid (both paid AND refunded are terminal in normal flow)
--
-- To issue a refund an admin must use the "Correct status" override path, which is
-- audited and requires a note — making refunds a deliberate, logged action rather
-- than a routine dropdown choice.
--
-- Only the transition table inside admin_set_payment_status changes; the override
-- path (p_override = TRUE) still allows moving to any valid status so corrections
-- remain possible.

DROP FUNCTION IF EXISTS public.admin_set_payment_status(UUID, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
-- Also drop the pre-conflict-guard 7-arg signature (from 20260615) so it can't linger
-- as an orphan overload alongside the 8-arg version below.
DROP FUNCTION IF EXISTS public.admin_set_payment_status(UUID, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_set_payment_status(
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

  IF p_expected_status IS NOT NULL AND v_from <> p_expected_status THEN
    owner_id := v_owner; from_status := v_from; result := 'conflict';
    RETURN NEXT; RETURN;
  END IF;

  IF p_override THEN
    v_ok := TRUE;
  ELSE
    -- Normal flow: pending → paid only. Both paid and refunded are terminal.
    -- Refunds require the correction/override path (audited, note mandatory).
    v_ok := CASE
      WHEN v_from = 'pending' AND p_status = 'paid' THEN TRUE
      ELSE FALSE
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
