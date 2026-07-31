# Checkout Workflow — Order Placement (cart → order)

## Context

Orders today are **read-only**: the `orders` / `order_items` tables, the customer
order pages, the full admin order platform, and the status/payment audit RPCs all
exist, but nothing ever *creates* an order — the data is hand-seeded by
`seed_orders.sql`. The Cart page's "Secure Checkout" button is inert (no `onClick`),
and the schema was deliberately shaped for placement so it could be added later
without rework.

This plan builds that missing piece: a **Razorpay-prepaid checkout** that prices the
order server-side, takes payment, then **atomically** creates the order (snapshotting
line items, decrementing variant stock with an oversell guard, seeding the opening
status/payment audit entries, and clearing the cart). It serves **two entry points**:
the normal **cart → checkout** flow, and a **"Buy Now" direct-buy** flow that purchases
a single item without touching the cart. It also adds a **10%-off first-order** discount
(server-validated) and a **wired-but-stubbed** confirmation-email hook the user will fill
in later.

"Buy Now" already exists in the UI but is minimal: on the PDP
(`components/ProductPreviewView.tsx` `handleBuyNow`) it just adds to cart and routes to
`/cart`; in `components/product/QuickViewDrawer.tsx` the button is decorative. This plan
gives it a real **direct** path.

Everything reuses existing patterns: `requireAuth` + `req.userId`, the
`supabaseAdmin` service-role client (bypasses the insert-locked RLS), the
`admin_set_order_status`-style **locked transactional RPC**, the
`createLog()` logger, `redisDel` cache-busting, and the `authFetch` API-lib pattern
from `ordersApi.ts`.

## Key decisions
- **Payment:** Razorpay online only (`payment_method='online'`).
- **Inventory:** atomic stock check + decrement inside the placement RPC under a row
  lock; `is_unlimited` variants skip the check; insufficient stock blocks placement.
- **Discount:** 10% off the subtotal **only on a customer's first order**, validated
  server-side against their order count (never trusted from the browser).
- **Email:** a `sendOrderConfirmation()` hook is called fire-and-forget after success
  but left as a clearly-marked stub (no Resend wiring yet).
- **Placement model: verify-then-create.** No DB order is written until payment is
  verified, so abandoned/failed payments never pollute `orders`. A webhook is the
  backstop. Trade-off (rare paid-but-oversold race) handled explicitly — see below.
- **Buy Now = true direct buy.** Checkout runs in `mode: 'cart' | 'direct'`. In `direct`
  mode the single item (`{slug, sku, size, qty}`) is priced and stock-checked on its own;
  the user's cart is **not** read and **not** cleared on success.

---

## 1. Database — new migration `lil-edit/supabase/migrations/20260618_place_order.sql`
⚠️ **Filename fix:** the originally-named `20260613` collides with the existing
`20260613_order_status_correction.sql` (and `20260613` is today). `20260617` is the latest
file, so this is `20260618_place_order.sql`.

- **`order_number` generation:** `CREATE SEQUENCE IF NOT EXISTS order_number_seq;` formatted
  `'LE' || lpad(nextval('order_number_seq')::text, 6, '0')` (e.g. `LE000123`), distinct from
  the seed's `LE-SEED-NNNN`. Generated **inside the RPC** (after the idempotency check, so a
  retried verify+webhook never burns a number).
- **Idempotency:** partial unique index
  `CREATE UNIQUE INDEX ... ON orders(transaction_id) WHERE transaction_id IS NOT NULL`
  so a Razorpay payment id can't create two orders (verify + webhook race).
- **RPC `place_order(...)`** — single transaction, matches the existing RPC convention in
  `20260616`/`20260617` (plain `LANGUAGE plpgsql`, **not** `SECURITY DEFINER`; the
  service-role backend is the only caller and already bypasses RLS):
  - Params: `p_user_id`, `p_shipping_address jsonb`,
    `p_items jsonb` (array of `{product_id, product_slug, category_slug, sku, size, title,
    image_url, color_name, color_hex, unit_price, original_price, quantity, line_total}`
    — **`product_id` included**: the soft FK added in `20260608`, looked up from
    `products.id` by slug; the read side selects it),
    `p_subtotal`, `p_discount`, `p_shipping_fee`, `p_total`, `p_item_count`,
    `p_payment_method`, `p_payment_status`, `p_status`, `p_transaction_id`,
    `p_expect_first_order bool`, `p_clear_cart bool`.
  - **Per-user advisory lock first:** `PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text))`
    so one user's concurrent placements serialize — tightens both the first-order check and
    the stock decrement without locking the whole table.
  - **Idempotency check:** if an order with `p_transaction_id` already exists, return its id
    with `result='exists'` (no double order for one payment).
  - **First-order re-check:** if `p_expect_first_order`, assert
    `(SELECT count(*) FROM orders WHERE user_id = p_user_id) = 0`; mismatch →
    `result='discount_invalid'` (caller retries without the discount).
  - **Stock loop (NULL-safe):** for each item, `SELECT ... FOR UPDATE` the
    `product_variants` row by `variant_sku`.
    - Variant found: if `is_unlimited` **or `stock IS NULL`** → skip (unlimited variants now
      store `stock = NULL`, per `20260517_add_is_unlimited_to_variants`); else if
      `stock < qty` → `result='oversold'` (return offending sku); else
      `UPDATE ... SET stock = stock - qty` (the table's `CHECK (stock >= 0)` is a backstop).
    - No variant (sku == base_sku): the product is sellable on the base sku only when
      `products.is_unlimited` (there is no per-product stock column — `total_stock` was
      dropped in `20260517`). If not unlimited → `result='oversold'`.
  - Insert `orders` (with the in-RPC `order_number`, `status=p_status`), then `order_items`
    (snapshots from `p_items`, including `product_id` + `original_price`).
  - Seed opening audit rows exactly like the existing backfills: `order_status_history`
    `(NULL → p_status)` and `payment_status_history` `(NULL → p_payment_status)` with
    `changed_by = NULL, changed_by_name = 'System', changed_by_email = ''`. (Omit `note` /
    `is_correction` — later-added columns default fine.)
  - **Cart clear (precise):** when `p_clear_cart` (cart mode), delete only the purchased
    lines — `DELETE FROM cart_items WHERE user_id = p_user_id AND (sku, size) IN (<pairs from
    p_items>)` — so an item added after `/initiate` isn't wiped. Direct-buy passes `false`.
  - Return `(order_id, order_number, result)`,
    `result ∈ created|exists|oversold|discount_invalid`.

No changes to RLS (placement runs through the service-role client, which bypasses it).

## 2. Backend — new `backend/routes/checkout.ts`

Add dependency `razorpay` (backend). New env vars: `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; frontend `VITE_RAZORPAY_KEY_ID`.

**Mounting (`server.ts`) — order matters:**
- ⚠️ **Webhook raw body:** the global `app.use(express.json())` consumes the request body,
  but Razorpay's webhook HMAC must be computed over the **raw bytes**. Register the webhook
  with a raw parser on its exact path *before* the global JSON middleware:
  `app.use("/api/checkout/webhook", express.raw({ type: "*/*" }), webhookHandler)`.
- Mount the rest as `app.use("/api/checkout", checkoutRouter)` after `express.json()`.
- ⚠️ **Limiter placement:** apply `mutationLimiter` **inside** the router on `/initiate` +
  `/verify` only (the way `adminOrders.ts` scopes `adminMutationLimiter` to its PATCHes) —
  NOT at mount — so Razorpay's webhook retries and the `/coupon` GET aren't throttled.

A shared **`priceOrder(userId, source)`** helper where `source` is the user's cart or a
single direct item:
- **cart source:** re-reads `cart_items` + `products` exactly like `cart.ts` GET.
- **direct source:** `{ product_slug, sku, size, quantity }`, validated the way
  `cart.ts POST /add` does, built into a one-line snapshot.
- Builds priced item snapshots (each carrying `product_id` looked up by slug), computes
  `subtotal` and `shippingFee`. **Shipping rule (₹199 when `0 < subtotal ≤ 5000`, else free)
  is implemented here in the backend authoritatively, and duplicated in the frontend
  `lib/pricing.ts`** — the two packages can't share code. Discount layered on by the caller.

**Coupon:** one concrete code `FIRST10` = 10% off subtotal, **eligibility = the customer's
first order** (`count(orders where user_id) == 0`). Validated for live feedback at
`/coupon`, authoritatively re-checked at `/initiate` and `/verify`, and finally asserted in
the RPC (`p_expect_first_order`).

- **`POST /initiate`** (`requireAuth` + `mutationLimiter`): body
  `{ mode: 'cart'|'direct', item?, addressId, couponCode? }`.
  - Verify the address belongs to the user (`addresses` by id + `user_id`); snapshot its
    fields (`label, line1, line2, landmark, city, state, country, pincode`) — matches the
    `OrderAddress` shape the order pages read.
  - `priceOrder(...)`; apply `FIRST10` discount if eligible.
  - **Early stock pre-check** (non-locking): if any line is out of stock, 409 *before*
    creating the Razorpay order — so the common OOS case is caught before the customer pays,
    shrinking the paid-but-oversold window (authoritative lock+decrement is still at verify).
  - Create the Razorpay order (`amount = Math.round(total*100)` paise, `currency:'INR'`).
  - **Persist the priced snapshot** (items + totals + addressId snapshot + mode + discount)
    in Redis under `checkout:<razorpayOrderId>` (new `CHECKOUT_TTL_S`, ~30 min) so `/verify`
    places **exactly** what was quoted and paid — eliminating cart-drift between initiate and
    verify. Also stash `{ userId, addressId, mode }` in Razorpay **order notes** as the
    durable fallback the webhook can always read.
  - Return `{ razorpayOrderId, amount, currency, keyId, pricing }`.
- **`POST /verify`** (`requireAuth` + `mutationLimiter`): body
  `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`.
  - Verify HMAC `hmac_sha256("<order_id>|<payment_id>", KEY_SECRET) === signature`.
  - `razorpay.payments.fetch(payment_id)` → confirm `status==='captured'` and capture its
    authoritative `amount`.
  - Load the priced snapshot from `checkout:<order_id>`. **Fallback if absent** (Redis
    down/evicted): re-price from DB + re-check coupon, then **assert the recomputed total ===
    the captured amount**; on mismatch do NOT place — log + leave for refund and return an
    error ("cart changed, payment will be refunded"). On match, place the re-priced order.
  - Call `place_order(... p_status='confirmed', p_payment_status='paid',
    p_payment_method='online', p_transaction_id=razorpay_payment_id,
    p_clear_cart=(mode==='cart'))`.
  - Handle RPC `result`: `created`/`exists` → 200 `{ orderId, orderNumber }`;
    `oversold` → 409 + log/flag for refund (payment already captured — surface via the
    existing admin refund/correction path); `discount_invalid` → retry once without discount.
  - `redisDel` the owner's `order:list` + `order:detail` keys, the `cart` key (cart mode
    only), and the `checkout:<order_id>` snapshot.
  - Fire-and-forget `sendOrderConfirmation(order)` (stub).
- **`POST /webhook`** (raw body; verify `x-razorpay-signature` =
  `hmac_sha256(rawBody, RAZORPAY_WEBHOOK_SECRET)`): on `payment.captured`, recover context
  from the `checkout:<order_id>` snapshot (or Razorpay order notes), then run the **same**
  place-order path keyed by `razorpay_payment_id`. Idempotent via the `transaction_id` unique
  index + RPC `exists` short-circuit, so it's a no-op when `/verify` already placed the order.
  Always `200` quickly so Razorpay stops retrying.
- **`GET /coupon?code=...`** (`requireAuth`): live "Apply" feedback → `{ valid, discount, reason }`.

New stub `backend/lib/orderEmail.ts`: `export async function sendOrderConfirmation(order)`
— logs intent and returns; clearly marked `// TODO: wire Resend` for later (pass the order +
recipient email so wiring is a one-liner).

Also edit **`backend/lib/redis.ts`**: add `CHECKOUT_TTL_S` and add `"checkout"` to the
`redisKey` prefix union.

## 3. Frontend

- **`lib/pricing.ts`** (new): extract the subtotal / savings / shipping-fee math
  currently inline in `Cart.tsx` so Cart and Checkout share one source of truth.
- **`lib/checkoutApi.ts`** (new): `initiateCheckout({ mode, item?, addressId, couponCode? })`,
  `verifyCheckout`, `validateCoupon` — `authFetch` + console-log pattern copied from
  `ordersApi.ts`. Plus a `loadRazorpayScript()` helper that injects `checkout.js` once, and a
  minimal `declare global { interface Window { Razorpay: ... } }` so `new window.Razorpay(opts)`
  type-checks (SDK is loaded via script tag, no npm types on the frontend).
- **`pages/Checkout.tsx`** (new, lazy + `<ProtectedRoute>` in `App.tsx`): reads
  `mode`/`item` from React Router **navigation state** (`useLocation().state`) — defaults
  to `cart`; `direct` carries the single item. Three sections on one page —
  (1) **Address**: fetch the user's `addresses` (reuse the `Address` type from
  `components/profile/AddressManager.tsx`), select default, link to Profile to add one if
  none; (2) **Order summary**: cart mode prices from `useCart()` + `lib/pricing.ts`; direct
  mode renders just the passed item (authoritative pricing returned by `/initiate`), with
  the coupon box (placeholder hinting `FIRST10`) calling `validateCoupon`; (3) **Pay**:
  button → `initiateCheckout` → open Razorpay modal → on success `verifyCheckout` →
  `navigate('/orders/:id?placed=1')`. Guard: if `direct` state is missing/invalid, fall back
  to `cart` mode (so a hard refresh of `/checkout` doesn't break — nav state is lost on reload).
- **`pages/Cart.tsx`**: add `useNavigate` (currently imports only `Link`) and wire the
  existing "Secure Checkout" button → `navigate('/checkout')` (cart mode; already disabled
  when empty; also require login).
- **Buy Now wiring (direct mode):**
  - `components/ProductPreviewView.tsx` `handleBuyNow` — instead of `addToCart` + `/cart`,
    `navigate('/checkout', { state: { mode: 'direct', item: { product_slug, sku: currentSku,
    size: selectedSize ?? '', quantity } } })`. Keep the size-required guard and login check.
  - `components/product/QuickViewDrawer.tsx` — give the currently-decorative "Buy Now"
    button the same `navigate('/checkout', { state: { mode:'direct', item } })` onClick
    (disabled when `!inStock`, respects `hideBuyNow`).
- **`pages/OrderDetail.tsx`**: read `useSearchParams` (page doesn't use it today) — when
  `?placed=1`, show a one-time success banner, then strip the param via `setSearchParams`.
- After a cart-mode placement call `useCart().refetchCart()` so the navbar badge clears
  (the verify call already cleared the cart server-side + busted its Redis key).

## Files to touch
- **New:** `supabase/migrations/20260618_place_order.sql`, `backend/routes/checkout.ts`,
  `backend/lib/orderEmail.ts`, `lil-edit/src/lib/checkoutApi.ts`,
  `lil-edit/src/lib/pricing.ts`, `lil-edit/src/pages/Checkout.tsx`.
- **Edit:** `backend/server.ts` (raw-body webhook mount + router mount),
  `backend/lib/redis.ts` (`CHECKOUT_TTL_S` + `"checkout"` prefix), `backend/package.json` (+razorpay),
  `lil-edit/src/App.tsx` (route), `lil-edit/src/pages/Cart.tsx` (button + use pricing util),
  `lil-edit/src/components/ProductPreviewView.tsx` + `components/product/QuickViewDrawer.tsx`
  (Buy Now → direct checkout), `lil-edit/src/pages/OrderDetail.tsx` (success banner),
  `.env` examples both sides.

## Manual steps (user)
1. Run `20260618_place_order.sql` in Supabase SQL editor.
2. Set Razorpay env vars (backend `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`, frontend
   `VITE_RAZORPAY_KEY_ID`) and register the webhook URL in the Razorpay dashboard.
3. `npm i razorpay` in `backend/`.

## Verification (end-to-end)
- With Razorpay **test keys**: log in, add items, go to Cart → Secure Checkout → pick an
  address → apply `FIRST10` (confirm 10% shows) → Pay with a Razorpay test card → land on
  the order detail with the success banner (and the `?placed=1` param then stripped).
- Confirm in Supabase: one `orders` row (`status=confirmed`, `payment_status=paid`,
  `payment_method=online`, `transaction_id` set, correct subtotal/discount/shipping/total),
  matching `order_items` snapshots (with `product_id` + `original_price`), opening rows in
  both history tables (actor `System`), decremented `product_variants.stock`, and the
  purchased lines removed from `cart_items`.
- **Idempotency:** re-fire the `payment.captured` webhook for the same payment → no duplicate
  order (RPC `exists` + `transaction_id` unique index). Confirm the webhook signature check
  passes (raw-body mount working) and rejects a tampered body.
- **Oversell:** set a variant `stock=1`, buy qty 2 → blocked (`oversold`) at `/initiate`
  pre-check; also verify the RPC blocks it under load. Confirm an `is_unlimited`
  (`stock = NULL`) variant checks out without error and isn't decremented.
- **Coupon:** a second order by the same user → `FIRST10` rejected (not first order).
- **Buy Now:** from a PDP with items already in the cart, click Buy Now → checkout shows
  only that one item → pay → order created with just that line, and the **pre-existing cart
  is untouched**. Repeat from QuickViewDrawer's Buy Now button.
- **Order-number uniqueness / sequence:** place two orders → distinct `LExxxxxx` numbers,
  no gap from the idempotent retry.
- `tsc`/build clean on both `backend` and `lil-edit`; console logs present per project
  convention (never stripped).
