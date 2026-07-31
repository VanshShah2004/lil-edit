-- Status correction (override) for finalized orders.
--
-- `delivered` and `cancelled` are terminal in the normal flow (the forward-only
-- machine in admin_set_order_status). But an admin who sets the wrong terminal status
-- by mistake needs an in-app correction path instead of editing the database by hand.
--
-- This adds a GUARDED override: corrections pass p_override = TRUE, which bypasses the
-- forward-only check (so the order can move out of a terminal state), records the row
-- with is_correction = TRUE, and stays fully audited (who/when/from→to/note). The
-- orders.status CHECK constraint still guards the target value, so only real statuses
-- are reachable. The function is dropped and recreated because its signature changes.

ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS is_correction BOOLEAN NOT NULL DEFAULT FALSE;

DROP FUNCTION IF EXISTS public.admin_set_order_status(UUID, TEXT, UUID, TEXT, TEXT, TEXT);

CREATE FUNCTION public.admin_set_order_status(
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

  IF p_override THEN
    -- Correction: allow moving to any other valid status, including out of a terminal
    -- state. The orders.status CHECK constraint still rejects bogus values.
    v_ok := TRUE;
  ELSE
    v_ok := CASE
      WHEN v_from IN ('pending','confirmed') AND p_status IN ('processing','shipped','delivered','cancelled') THEN TRUE
      WHEN v_from = 'processing'             AND p_status IN ('shipped','delivered','cancelled')               THEN TRUE
      WHEN v_from = 'shipped'                AND p_status IN ('delivered','cancelled')                         THEN TRUE
      ELSE FALSE                  -- delivered & cancelled are terminal in the normal flow
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
