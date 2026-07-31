-- Order status audit trail.
--
-- Every admin status change is appended here as an immutable record of WHO changed
-- it, WHEN, and FROM→TO. The acting admin's name/email are SNAPSHOTTED into the row
-- so the audit log stays readable even if that admin's profile is later edited or
-- deleted (same snapshot posture as order_items vs. products).
--
-- Writes happen only through admin_set_order_status() (below), which updates the
-- order and appends the audit row in a single transaction — so the trail can never
-- desync from the actual order state. There are deliberately NO client RLS policies
-- (default-deny); the service-role backend reads/writes it.

-- ─── order_status_history ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- NULL only for the synthetic "order placed" entry that opens each timeline.
  from_status      TEXT        CHECK (from_status IS NULL OR from_status IN
                     ('pending','confirmed','processing','shipped','delivered','cancelled')),
  to_status        TEXT        NOT NULL CHECK (to_status IN
                     ('pending','confirmed','processing','shipped','delivered','cancelled')),
  -- Soft link to the acting admin (NULL for system/backfilled entries). The
  -- snapshot columns render the row regardless of whether this still resolves.
  changed_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name  TEXT        NOT NULL DEFAULT '',
  changed_by_email TEXT        NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx
  ON order_status_history (order_id, created_at DESC);

-- Audit rows are immutable: no client access at all (default-deny). The backend
-- writes them via the service-role client / the function below.
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

-- ─── admin_set_order_status() — atomic status change + audit append ──────────────
-- Locks the order row (FOR UPDATE) so concurrent admin edits serialize, updates the
-- status, and appends the audit entry — all in one transaction. Returns the owner
-- id (for cache busting) and whether anything actually changed.
CREATE OR REPLACE FUNCTION public.admin_set_order_status(
  p_order_id    UUID,
  p_status      TEXT,
  p_admin_id    UUID,
  p_admin_name  TEXT,
  p_admin_email TEXT
)
RETURNS TABLE (owner_id UUID, from_status TEXT, changed BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_from  TEXT;
  v_owner UUID;
BEGIN
  SELECT status, user_id INTO v_from, v_owner
  FROM orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;                       -- no rows → caller treats as 404
  END IF;

  -- No-op: report the current state without touching the order or the audit log.
  IF v_from = p_status THEN
    owner_id := v_owner; from_status := v_from; changed := FALSE;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE orders SET status = p_status WHERE id = p_order_id;

  INSERT INTO order_status_history
    (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email)
  VALUES
    (p_order_id, v_from, p_status, p_admin_id, p_admin_name, p_admin_email);

  owner_id := v_owner; from_status := v_from; changed := TRUE;
  RETURN NEXT;
END;
$$;

-- ─── Backfill ───────────────────────────────────────────────────────────────────
-- Give every existing order an opening "order placed" entry (from NULL → current
-- status) so timelines aren't empty for orders that predate this table. Idempotent:
-- only inserts for orders that have no history yet.
INSERT INTO order_status_history
  (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email, created_at)
SELECT o.id, NULL, o.status, NULL, 'System', '', o.created_at
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM order_status_history h WHERE h.order_id = o.id
);
