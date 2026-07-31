-- Order status state machine.
--
-- Enforces legal status transitions INSIDE admin_set_order_status() — under the same
-- FOR UPDATE row lock that does the write — so the rule is atomic and can't be raced.
-- Illegal moves (e.g. delivered → pending, un-cancelling, skipping shipped) are
-- rejected at the database, not just the UI.
--
-- Rule: an order may move FORWARD to any later stage (skipping ahead is fine) or be
-- cancelled, but never move backward, and terminal states never change.
-- Allowed transitions:
--   pending / confirmed → processing, shipped, delivered, cancelled
--   processing          → shipped, delivered, cancelled
--   shipped             → delivered, cancelled
--   delivered           → (terminal)
--   cancelled           → (terminal)
--
-- The function's return type changes (adds a `result` discriminator), so it must be
-- dropped and recreated rather than CREATE OR REPLACE'd.

DROP FUNCTION IF EXISTS public.admin_set_order_status(UUID, TEXT, UUID, TEXT, TEXT);

CREATE FUNCTION public.admin_set_order_status(
  p_order_id    UUID,
  p_status      TEXT,
  p_admin_id    UUID,
  p_admin_name  TEXT,
  p_admin_email TEXT
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
    (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email)
  VALUES
    (p_order_id, v_from, p_status, p_admin_id, p_admin_name, p_admin_email);

  owner_id := v_owner; from_status := v_from; result := 'changed';
  RETURN NEXT;
END;
$$;
