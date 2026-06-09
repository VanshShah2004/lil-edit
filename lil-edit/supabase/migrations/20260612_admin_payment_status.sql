-- Admin-managed payment status + its audit trail.
--
-- Mirrors the order-status machinery (order_status_history / admin_set_order_status):
-- every admin change to orders.payment_status is appended here as an immutable record
-- of WHO changed it, WHEN, and FROM→TO, with the acting admin's name/email SNAPSHOTTED
-- so the log stays readable even if that admin's profile is later edited or deleted.
--
-- Writes happen only through admin_set_payment_status() (below), which locks the order
-- row, validates the transition, updates payment_status, and appends the audit row in a
-- single transaction — so the trail can never desync from the order's actual payment
-- state. There are deliberately NO client RLS policies (default-deny); the service-role
-- backend reads/writes it.

-- ─── payment_status_history ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_status_history (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- NULL only for the synthetic opening entry that seeds each order's payment trail.
  from_status      TEXT        CHECK (from_status IS NULL OR from_status IN
                     ('pending','paid','failed','refunded')),
  to_status        TEXT        NOT NULL CHECK (to_status IN
                     ('pending','paid','failed','refunded')),
  -- Soft link to the acting admin (NULL for system/backfilled entries). The snapshot
  -- columns render the row regardless of whether this still resolves.
  changed_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name  TEXT        NOT NULL DEFAULT '',
  changed_by_email TEXT        NOT NULL DEFAULT '',
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_status_history_order_id_idx
  ON payment_status_history (order_id, created_at DESC);

-- Audit rows are immutable: no client access at all (default-deny). The backend writes
-- them via the service-role client / the function below.
ALTER TABLE payment_status_history ENABLE ROW LEVEL SECURITY;

-- ─── admin_set_payment_status() — atomic payment change + audit append ────────────
-- Locks the order row (FOR UPDATE) so concurrent admin edits serialize, validates the
-- transition under the lock, updates payment_status, and appends the audit entry — all
-- in one transaction. Returns the owner id (for cache busting), the previous status, and
-- a result ∈ ('changed','unchanged','invalid'); zero rows ⇒ order not found.
--
-- Transition machine (deliberately strict, like the order one):
--   pending  → paid, failed
--   failed   → paid, pending      (retry / reset)
--   paid     → refunded
--   refunded → (terminal)
CREATE OR REPLACE FUNCTION public.admin_set_payment_status(
  p_order_id    UUID,
  p_status      TEXT,
  p_admin_id    UUID,
  p_admin_name  TEXT,
  p_admin_email TEXT,
  p_note        TEXT DEFAULT NULL
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
    RETURN;                       -- no rows → caller treats as 404
  END IF;

  -- No-op: report current state, touch nothing.
  IF v_from = p_status THEN
    owner_id := v_owner; from_status := v_from; result := 'unchanged';
    RETURN NEXT; RETURN;
  END IF;

  v_ok := CASE
    WHEN v_from = 'pending' AND p_status IN ('paid','failed')   THEN TRUE
    WHEN v_from = 'failed'  AND p_status IN ('paid','pending')  THEN TRUE
    WHEN v_from = 'paid'    AND p_status = 'refunded'           THEN TRUE
    ELSE FALSE                    -- refunded is terminal
  END;

  IF NOT v_ok THEN
    owner_id := v_owner; from_status := v_from; result := 'invalid';
    RETURN NEXT; RETURN;
  END IF;

  UPDATE orders SET payment_status = p_status WHERE id = p_order_id;

  INSERT INTO payment_status_history
    (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email, note)
  VALUES
    (p_order_id, v_from, p_status, p_admin_id, p_admin_name, p_admin_email, NULLIF(btrim(p_note), ''));

  owner_id := v_owner; from_status := v_from; result := 'changed';
  RETURN NEXT;
END;
$$;

-- ─── Backfill ───────────────────────────────────────────────────────────────────
-- Give every existing order an opening entry (from NULL → current payment_status) so
-- payment trails aren't empty for orders that predate this table. Idempotent: only
-- inserts for orders with no payment history yet.
INSERT INTO payment_status_history
  (order_id, from_status, to_status, changed_by, changed_by_name, changed_by_email, created_at)
SELECT o.id, NULL, o.payment_status, NULL, 'System', '', o.created_at
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM payment_status_history h WHERE h.order_id = o.id
);
