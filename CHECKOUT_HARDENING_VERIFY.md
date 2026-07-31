# Checkout Hardening — Log Verification Guide

How to confirm the three hardening fixes work, by watching the **backend terminal logs**
(`npm run dev` / `tsx server.ts`). Each fix below lists the trigger, the **exact log lines**
to look for, and the pass criteria.

> **Run in dev, not prod.** The per-request `OpLogger` lines (`step` / `warn` / `success`)
> only print when `NODE_ENV !== "production"`. `error` lines and the `[rate-limit]` lines
> print in **all** environments. So verify with `NODE_ENV` unset (or `development`).

### Reading the logger
Every request opens a numbered block; that number is the **serial `sr`**:
```
42 - START - CHECKOUT INITIATE          ← sr = 42
  [42] ...                               ← step  (two-space indent, [sr])
[42] WARNING - ...                       ← warn
[42] SUCCESS - ...                       ← success
[42] ERROR - ... : <detail>              ← error (always prints)
42 - END - CHECKOUT INITIATE (123.4ms)
```
The `sr` is what ties a client-visible error `ref` back to the server logs (see Fix #3).

---

## Fix #1 — FIRST10 can't be claimed on two orders at once

A per-user **Redis `SET NX` hold** (`checkout:coupon-hold:<userId>:FIRST10`, 30-min TTL) is
taken in `/initiate`. Only one in-flight checkout per user can hold it; a second concurrent
checkout is priced at **full price**.

### 1a. Happy path — first-order discount applies
**Do:** Log in as a user with **zero past orders**, add items, go to Checkout, apply `FIRST10`, click **Pay**.
**Expect (in the `CHECKOUT INITIATE` block):**
```
  [N] DB first-order check: 12.3ms  existingOrders=0  → FIRST order (eligible)
  [N] L2 Redis - SETNX  key=checkout:coupon-hold:<userId>:FIRST10  TTL=1800s  → ACQUIRED
  [N] coupon "FIRST10" → VALID (FIRST10, 10% off)
  [N] subtotal=₹2598  shipping=₹199  discount=₹260  total=₹2537  firstOrder=true
```
**Pass:** `→ ACQUIRED`, `VALID`, and `discount=₹<non-zero>`.

### 1b. The fix in action — second concurrent checkout is denied the discount
**Do:** From 1a, **dismiss** the Razorpay modal (don't pay), then click **Pay again** — *or*
open Checkout in two tabs and click Pay in both. The 30-min hold is still held by the first.
**Expect (the second `CHECKOUT INITIATE` block, serial M):**
```
  [M] DB first-order check: 9.1ms  existingOrders=0  → FIRST order (eligible)
  [M] L2 Redis - SETNX  key=checkout:coupon-hold:<userId>:FIRST10  TTL=1800s  → HELD
[M] WARNING - FIRST10 already held by another in-flight checkout for this user — pricing at full price
  [M] coupon "FIRST10" → rejected
  [M] subtotal=₹2598  shipping=₹199  discount=₹0  total=₹2797  firstOrder=true
```
**Pass:** `→ HELD`, the `WARNING`, `rejected`, and **`discount=₹0`** even though
`existingOrders=0`. The Razorpay modal that opens charges the **full** total. ← this is the
exploit being blocked. (See *Known behavior* at the bottom about dismiss-then-retry.)

### 1c. Redis-down → fail open (never blocks a legit discount)
**Do:** Stop Redis (or unset `REDIS_URL`) and repeat 1a.
**Expect:**
```
  [K] WARNING - L2 Redis - SETNX failed  key=checkout:coupon-hold:<userId>:FIRST10 : <error>
  [K] coupon "FIRST10" → VALID (FIRST10, 10% off)
  [K] subtotal=₹2598  ...  discount=₹260  ...
```
**Pass:** the discount **still applies** (degrades to the prior, rare race rather than denying
a real customer). The DB still blocks *sequential* reuse in `place_order`.

---

## Fix #2 — Rate limiting keys on the real client IP

`app.set("trust proxy", 1)` makes `req.ip` the real client (from `X-Forwarded-For`) instead
of the proxy/LB IP — that's what closes the "everyone shares one bucket / `X-Forwarded-For`
is spoofable" gap. The store is **in-memory** (per-process): correct + effective on a single
instance. Moving counts to Redis is only needed for multiple instances (see *Known behavior*).

### 2a. Limiter config at startup
**Do:** Start the backend. **Expect one line at boot:**
```
[rate-limit] store=memory (per-process; trust-proxy keys on real client IP — move to Redis for multi-instance, see rateLimiters.ts)  tiers: global=500 mutation=100 admin=60 per 15min
```
**Pass:** the line prints (and the server boots with no `rate-limit-redis` crash).

### 2b. Throttle log shows the unmasked client IP
**Do:** Hammer a mutation route past its limit (e.g. >100 `POST /api/checkout/initiate` in 15
min — easiest with a quick loop/Postman runner).
**Expect, once the limit trips:**
```
[rate-limit] 429 THROTTLED  ip=49.36.12.34  POST /api/checkout/initiate  (limit 100/15min)
```
**Pass:** `ip=` is the **real client IP** (not `127.0.0.1` / the proxy's address) when behind
a proxy — that proves `trust proxy` is unmasking `X-Forwarded-For`. The response is `429` with
`RateLimit-*` headers. (Locally, with no proxy, `ip` is just your loopback/LAN address — still
correct; the proxy case is what `trust proxy` is for.)

---

## Fix #3 — Errors don't leak internals (generic message + `ref`)

Deliberate `PriceError`s keep their safe message; any *unexpected* failure returns a generic
message plus a **`ref`** equal to the log serial, with the raw detail logged server-side only.

### 3a. Handled error (safe message, surfaced as-is)
**Do:** Start a cart checkout with an **empty cart** (or remove all items, then Pay).
**Expect:**
```
[N] WARNING - initiate rejected (400)  Your cart is empty.
```
HTTP response: `400 { "error": "Your cart is empty." }` — no `ref` (it's an intended message).

### 3b. Unexpected error (generic message + ref ↔ sr)
**Do:** Force an internal failure — e.g. run `/verify` before the `20260618_place_order.sql`
migration is applied (the RPC is missing), or temporarily break a DB call.
**Expect server log:**
```
[N] ERROR - verify failed : place_order failed: <raw Postgres detail>
```
**Client receives:**
```json
{ "error": "We couldn't confirm your payment right now. If you were charged, your order will be created automatically — please check your Orders in a few minutes.", "ref": "N" }
```
**Pass:** the raw Postgres/SDK detail appears **only** in the server log; the client gets the
generic text. The `"ref": "N"` **equals** the `[N]` serial — grep the backend logs for that
number to find the full request + the real error. (`/initiate` and `/coupon` behave the same,
with their own generic messages.)

---

## Known behavior (not a bug)

- **Coupon hold is "sticky" for 30 min.** If a user opens a FIRST10 checkout and abandons it
  (dismisses the pay modal) without paying, re-clicking Pay within 30 min prices at **full
  price** (hold still held) and the pay modal charges full price. This is the same mechanism
  that blocks the abuse — a freely-releasable hold would re-open it for scripted attackers.
  The on-page summary may briefly still show the old discounted total behind the modal; the
  **charged** amount (the modal + the order) is always the correct, backend-computed one.
  *(Polish option: sync the Checkout page's displayed total to `init.pricing` after
  `/initiate` so the page never shows a discount the backend dropped.)*
- **Rate-limit store is in-memory.** Counts reset on restart and aren't shared across
  instances — fine for a single instance (the `trust proxy` fix is what matters). When you
  scale horizontally, move to `rate-limit-redis` with its **own** ioredis connection (offline
  queue enabled) — the shared cache client throws at import if reused (it's lazyConnect +
  offline-queue-off). See the header comment in `backend/middleware/rateLimiters.ts`.
- **Logs are dev-only** for the per-request lines (by design — see top). The `[rate-limit]`
  lines and `ERROR` lines print in production too.
