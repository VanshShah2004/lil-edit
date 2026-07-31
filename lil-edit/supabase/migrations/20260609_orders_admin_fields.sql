-- Admin order management: add the two fields the admin order detail surfaces that
-- the original orders table didn't carry.
--
--   tax            — tax component of the order total (the customer-facing pages
--                    fold tax into the total; the admin summary breaks it out).
--   transaction_id — payment-gateway reference for online payments (NULL for COD
--                    or until a gateway is wired up).
--
-- Both are additive and nullable/defaulted, so existing seeded orders keep
-- rendering — the admin UI shows "—" when they're absent. Order placement /
-- checkout will populate them once that pipeline lands.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tax            NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transaction_id TEXT;
