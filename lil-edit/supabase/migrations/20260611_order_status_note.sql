-- Optional admin note attached to a status change.
--
-- When an admin updates an order's status they can leave a short message/reminder
-- (e.g. "courier delayed, customer informed"). It's stored on the audit row and
-- shown only in the admin status-history view — the customer journey never selects
-- this column.
--
-- admin_set_order_status() gains a p_note parameter, so the function is dropped and
-- recreated (signature change).

ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS note TEXT;

DROP FUNCTION IF EXISTS public.admin_set_order_status(UUID, TEXT, UUID, TEXT, TEXT);

CREATE FUNCTION public.admin_set_order_status(
  p_order_id    UUID,
  p_status      TEXT,
  p_admin_id    UUID,
  p_admin_name  TEXT,
  p_admin_email TEXT,
  p_note        TEXT DEFAULT NULL
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
  SELECT status, user_id INTO v_from, v_owner
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

  v_ok := CASE
    WHEN v_from IN ('pending','confirmed') AND p_status IN ('processing','shipped','delivered','cancelled') THEN TRUE
    WHEN v_from = 'processing'             AND p_status IN ('shipped','delivered','cancelled')               THEN TRUE
    WHEN v_from = 'shipped'                AND p_status IN ('delivered','cancelled')                         THEN TRUE
    ELSE FALSE                    -- delivered & cancelled are terminal
  END;

  IF NOT v_ok THEN
    owner_id := v_owner; from_status := v_from; result := 'invalid';
    RETURN NEXT; RETURN;
  END IF;

  UPDATE orders SET status = p_status WHERE id = p_order_id;

  INSERT INTO order_status_history
    (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email, note)
  VALUES
    (p_order_id, v_from, p_status, p_admin_id, p_admin_name, p_admin_email, NULLIF(btrim(p_note), ''));

  owner_id := v_owner; from_status := v_from; result := 'changed';
  RETURN NEXT;
END;
$$;
