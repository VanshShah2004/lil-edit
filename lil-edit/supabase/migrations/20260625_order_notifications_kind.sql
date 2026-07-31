-- Add a `kind` discriminator to order_notifications so the customer order-confirmation
-- RECEIPT can be recorded alongside the per-status "your order is now <X>" emails — and
-- so the two are never conflated.
--
--   status  — a "your order is now <status>" email (admin "Notify customer" on a status
--             change, or the "Resend via Gmail" re-send in the Status History timeline).
--   receipt — the post-placement order-confirmation receipt (auto-sent fire-and-forget at
--             placement, or re-sent via the admin "Resend receipt" action).
--
-- The per-status "already notified" guard filters kind = 'status'; the receipt indicator
-- and the "Resend receipt" action filter kind = 'receipt'. Existing rows are all status
-- notifications, which the DEFAULT backfills correctly.

ALTER TABLE order_notifications
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'status'
    CHECK (kind IN ('status', 'receipt'));
