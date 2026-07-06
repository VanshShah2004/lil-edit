-- Follow-up to 20260707_remove_pending_order_status.sql: that migration tightened
-- orders.status but left two audit tables whose CHECK constraints still listed
-- 'pending' as a legal order status — order_status_history and order_notifications.
--
-- These are append-only audit logs, so unlike orders.status they CAN legitimately
-- still contain historical 'pending' rows: an order that passed through 'pending'
-- during early development keeps that record here forever, even after the order
-- itself moved on to 'confirmed'. A plain ADD CONSTRAINT ... CHECK validates every
-- existing row and would fail ("violated by some row") on any such legacy record.
--
-- So we add the tightened constraints as NOT VALID: existing rows are left untouched
-- (an audit trail must never be rewritten), while every NEW insert/update is checked —
-- so 'pending' can never be written again. Idempotent: safe to re-run.

ALTER TABLE order_status_history DROP CONSTRAINT IF EXISTS order_status_history_from_status_check;
ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_from_status_check
  CHECK (from_status IS NULL OR from_status IN ('confirmed','processing','shipped','delivered','cancelled')) NOT VALID;

ALTER TABLE order_status_history DROP CONSTRAINT IF EXISTS order_status_history_to_status_check;
ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_to_status_check
  CHECK (to_status IN ('confirmed','processing','shipped','delivered','cancelled')) NOT VALID;

ALTER TABLE order_notifications DROP CONSTRAINT IF EXISTS order_notifications_status_check;
ALTER TABLE order_notifications ADD CONSTRAINT order_notifications_status_check
  CHECK (status IN ('confirmed','processing','shipped','delivered','cancelled')) NOT VALID;
