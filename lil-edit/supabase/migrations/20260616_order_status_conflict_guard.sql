-- Stale-edit (optimistic concurrency) guard for order and payment status updates.
--
-- Problem: two admins on stale views of the same order can both submit status changes.
-- The DB serialises writes (FOR UPDATE lock), so data is never corrupt, but Admin B
-- silently acts on information Admin A has already changed underneath them.
--
-- Fix: the caller optionally passes p_expected_status — the status they *read* before
-- deciding to write. The RPC checks it under the row lock; if the actual current status
-- no longer matches, it returns result='conflict' (with from_status = actual current)
-- so the backend can return HTTP 409 and the frontend can reload and show a warning.
-- p_expected_status = NULL (default) skips the check — fully backward-compatible.
--
-- Recreates both admin_set_order_status and admin_set_payment_status with an extra
-- p_expected_status TEXT DEFAULT NULL parameter appended (signature change requires
-- DROP + CREATE).

-- ─── admin_set_order_status ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_set_order_status(UUID, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN);

CREATE FUNCTION public.admin_set_order_status(
  p_order_id        UUID,
  p_status          TEXT,
  p_admin_id        UUID,
  p_admin_name      TEXT,
  p_admin_email     TEXT,
  p_note            TEXT    DEFAULT NULL,
  p_override        BOOLEAN DEFAULT FALSE,
  p_expected_status TEXT    DEFAULT NULL   -- NULL = skip conflict check (backward compat)
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
    RETURN;  -- no rows → caller treats as 404
  END IF;

  -- No-op: the order is already in the requested status.
  IF v_from = p_status THEN
    owner_id := v_owner; from_status := v_from; result := 'unchanged';
    RETURN NEXT; RETURN;
  END IF;

  -- Conflict guard: the caller told us what status they expect to be current;
  -- if it no longer matches, report the real state so the frontend can reload.
  IF p_expected_status IS NOT NULL AND v_from <> p_expected_status THEN
    owner_id := v_owner; from_status := v_from; result := 'conflict';
    RETURN NEXT; RETURN;
  END IF;

  IF p_override THEN
    -- Correction mode: allow moving to any other valid status (CHECK constraint
    -- still rejects bogus values).
    v_ok := TRUE;
  ELSE
    v_ok := CASE
      WHEN v_from IN ('pending','confirmed') AND p_status IN ('processing','shipped','delivered','cancelled') THEN TRUE
      WHEN v_from = 'processing'             AND p_status IN ('shipped','delivered','cancelled')               THEN TRUE
      WHEN v_from = 'shipped'                AND p_status IN ('delivered','cancelled')                         THEN TRUE
      ELSE FALSE  -- delivered & cancelled are terminal in the normal flow
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

-- ─── admin_set_payment_status ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_set_payment_status(UUID, TEXT, UUID, TEXT, TEXT, TEXT, BOOLEAN);

CREATE FUNCTION public.admin_set_payment_status(
  p_order_id        UUID,
  p_status          TEXT,
  p_admin_id        UUID,
  p_admin_name      TEXT,
  p_admin_email     TEXT,
  p_note            TEXT    DEFAULT NULL,
  p_override        BOOLEAN DEFAULT FALSE,
  p_expected_status TEXT    DEFAULT NULL   -- NULL = skip conflict check (backward compat)
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
  SELECT payment_status, user_id INTO v_from, v_owner
  FROM orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;  -- no rows → caller treats as 404
  END IF;

  -- No-op.
  IF v_from = p_status THEN
    owner_id := v_owner; from_status := v_from; result := 'unchanged';
    RETURN NEXT; RETURN;
  END IF;

  -- Conflict guard: abort if the admin's view is stale.
  IF p_expected_status IS NOT NULL AND v_from <> p_expected_status THEN
    owner_id := v_owner; from_status := v_from; result := 'conflict';
    RETURN NEXT; RETURN;
  END IF;

  IF p_override THEN
    v_ok := TRUE;
  ELSE
    v_ok := CASE
      WHEN v_from = 'pending' AND p_status = 'paid'     THEN TRUE
      WHEN v_from = 'paid'    AND p_status = 'refunded'  THEN TRUE
      ELSE FALSE  -- refunded is terminal
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
