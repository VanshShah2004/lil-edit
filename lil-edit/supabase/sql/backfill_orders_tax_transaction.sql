-- One-off backfill: populate dummy `tax` + `transaction_id` on EXISTING orders so
-- the admin order detail / summary renders realistic values before a real
-- checkout pipeline exists to set them. Run AFTER the migration
-- 20260609_orders_admin_fields.sql (which adds the two columns).
--
-- Safe assumptions: there is no checkout yet, so every orders row is seed/dummy
-- data — recomputing `total` here only touches placeholder orders.
--
-- Idempotent:
--   * tax is set only where it is still 0 (the column default), so re-running
--     won't compound it.
--   * total is recomputed so the admin Order Summary stays internally consistent
--     (Subtotal − Discount + Shipping + Tax = Grand Total).
--   * transaction_id is filled only where NULL, and only for paid / online
--     orders — COD-pending orders realistically have none and keep showing "—".

-- 1. Dummy 5% GST, folding it into the order total so the breakdown adds up.
UPDATE orders
   SET tax   = ROUND(subtotal * 0.05, 2),
       total = ROUND(subtotal - discount + shipping_fee + ROUND(subtotal * 0.05, 2), 2)
 WHERE tax = 0;

-- 2. Dummy payment-gateway reference for orders that were actually paid / online.
--    Derived from the order id so it's stable across re-runs.
UPDATE orders
   SET transaction_id = 'TXN-' || to_char(created_at, 'YYYYMMDD') || '-'
                        || upper(substr(md5(id::text), 1, 10))
 WHERE transaction_id IS NULL
   AND (payment_status = 'paid' OR payment_method = 'online');

-- Quick check (optional):
-- SELECT order_number, payment_method, payment_status, subtotal, discount,
--        shipping_fee, tax, total, transaction_id
--   FROM orders ORDER BY created_at DESC;
