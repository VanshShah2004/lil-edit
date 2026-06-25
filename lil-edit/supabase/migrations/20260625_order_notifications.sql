-- Customer status-notification audit trail.
--
-- One row per customer "your order is now <status>" email that ACTUALLY went out
-- (admin "Notify customer" on a status change, or the "Notify via Gmail" re-send in
-- the Status History timeline). It exists so the admin UI can tell, per status,
-- whether the customer has already been told — and warn before sending the same
-- update twice.
--
-- Only successful sends are recorded (the backend inserts after Resend confirms), so
-- the presence of a row means the email was accepted for delivery. There are
-- deliberately NO client RLS policies (default-deny); the service-role backend
-- reads/writes it, same posture as order_status_history.

CREATE TABLE IF NOT EXISTS order_notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- The order status the customer was notified about (the order's status at send time).
  status          TEXT        NOT NULL CHECK (status IN
                    ('pending','confirmed','processing','shipped','delivered','cancelled')),
  -- Snapshot of where it was sent — handy for the audit even if the profile changes.
  recipient_email TEXT        NOT NULL DEFAULT '',
  -- Soft link to the admin who triggered it (NULL for system sends). Snapshot of the
  -- name keeps the row readable if that admin's profile is later edited/removed.
  sent_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_name    TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Has this order been notified, and for which statuses?" — the UI's lookup.
CREATE INDEX IF NOT EXISTS order_notifications_order_id_idx
  ON order_notifications (order_id, created_at DESC);

-- Audit rows are backend-only: no client access at all (default-deny). The service-role
-- backend writes them after a successful send and reads them for the detail payload.
ALTER TABLE order_notifications ENABLE ROW LEVEL SECURITY;
