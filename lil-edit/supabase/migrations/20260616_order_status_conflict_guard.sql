-- Optimistic-concurrency guard for order status changes.
--
-- Two admins can open the same order, then both Save. Without a guard the second save
-- silently overwrites the first (and may act on a status the admin never actually saw).
-- This adds a `p_expected_status` parameter: the status the admin READ before editing.
-- Checked under the same FOR UPDATE row lock that already serializes writes, so the
-- check is atomic — no TOCTOU race. If the order moved since the admin loaded it, the
-- function returns result = 'conflict' and the backend responds 409, prompting a reload.
--
-- `p_expected_status` is nullable: NULL means "don't check" (callers that don't care
-- still work). The function is dropped and recreated because its signature changes.
-- Mirrors admin_set_payment_status (20260617_paid_is_terminal.sql).

-- Drop BOTH the pre-guard 7-arg signature and the new 8-arg signature so this
-- migration is safe to re-run (re-running plain CREATE would hit "already exists").
DROP FUNCTION IF EXISTS public.admin_set_order_status(UUID, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_set_order_status(UUID, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT);

CREATE FUNCTION public.admin_set_order_status(
  p_order_id        UUID,
  p_status          TEXT,
  p_admin_id        UUID,
  p_admin_name      TEXT,
  p_admin_email     TEXT,
  p_note            TEXT    DEFAULT NULL,
  p_override        BOOLEAN DEFAULT FALSE,
  p_expected_status TEXT    DEFAULT NULL
)
-- result ∈ ('changed','unchanged','invalid','conflict'); zero rows ⇒ order not found.
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

  -- No-op: the order is already in the requested status. Treat as success regardless
  -- of expected_status (the end state matches the admin's intent).
  IF v_from = p_status THEN
    owner_id := v_owner; from_status := v_from; result := 'unchanged';
    RETURN NEXT; RETURN;
  END IF;

  -- Stale view: someone else moved the order since this admin loaded it.
  IF p_expected_status IS NOT NULL AND v_from <> p_expected_status THEN
    owner_id := v_owner; from_status := v_from; result := 'conflict';
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
