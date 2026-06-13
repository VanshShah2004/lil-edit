# Production Readiness Audit — The Lil Edit

> Grounded review of the backend routes, middleware, data layer, frontend client/auth, config, and migrations.
> Each finding is tied to actual code in the repo, with severity, location, and a concrete fix.
> **Date:** 2026-06-13 · **Branch reviewed:** `checkout-page`

**Severity key:** 🔴 High · 🟠 Medium · 🟡 Low

---

## Findings

| # | Severity | Category | Issue | Location | Recommended Fix |
|---|----------|----------|-------|----------|-----------------|
| 1 | 🔴 High | Security | All user routes run on the service-role client, which **bypasses RLS**. Ownership relies only on manually adding `.eq("user_id", userId)` — one forgotten filter = cross-account leak. | `cart.ts:10`, `orders.ts:9` | Use a per-request JWT client so RLS enforces ownership; add RLS policies as defense-in-depth. |
| 2 | 🔴 High | Security | Raw DB error messages (incl. hints/codes) returned to clients. Leaks internals. | `cart.ts:40,67`, `orders.ts:147,197`, most routes | Return generic message + correlation id; log detail server-side only. |
| 3 | 🔴 High | Security | No `trust proxy` set, but rate limiting keys on IP. Behind a proxy/LB, all users share one bucket or `X-Forwarded-For` is spoofable. | `server.ts`, `rateLimiters.ts` | `app.set("trust proxy", 1)`; verify limiter sees real client IP. |
| 4 | 🔴 High | Data integrity | Money handled as JS floats with `Number(x) \|\| 0` — parse failure silently becomes ₹0 (wrong total, not an error). | `orders.ts:79–83, 94–98` | Store money as integer paise; never default to 0 on failure. Fix before checkout ships. |
| 5 | 🟠 Med | Security | No `helmet`, no CSRF consideration, no validation library — validation is hand-rolled and inconsistent. | backend deps | Add `helmet`; adopt `zod` for body/param schemas. |
| 6 | 🟠 Med | Security | Account/email enumeration — signup returns `409 already registered`, login returns `{exists}`. | `auth.ts:49,124` | Return neutral responses; rate-limit these endpoints. |
| 7 | 🟠 Med | Security | Rate limiter uses in-memory store — not shared across instances, resets on restart. | `rateLimiters.ts` | Back with Redis via `rate-limit-redis`. |
| 8 | 🟡 Low | Security | Service key read from a `VITE_`-prefixed name fallback — footgun if it ever lands in frontend env (gets bundled). | `backend/lib/supabase.ts:14` | Drop the `VITE_` fallback for the service key. |
| 9 | 🟠 Med | Data integrity | Cart `/add` is check-then-act over a UNIQUE constraint → concurrent adds return **500** instead of incrementing. | `cart.ts:225–276` vs `20260525_cart_items.sql:13` | Atomic `upsert(onConflict: "user_id,sku,size")` + qty increment. |
| 10 | 🟠 Med | Data integrity | No quantity ceiling; `size` not validated against product's real sizes (only `sku` is). | `cart.ts:189–223` | Cap quantity; validate `size` against variant's allowed sizes. |
| 11 | 🟠 Med | Data integrity | Checkout/order placement still a plan, not code — the most correctness-sensitive flow is unbuilt. | `CHECKOUT_PLAN.md` | Implement per plan (atomic RPC, oversell guard, idempotency, server-side pricing). |
| 12 | 🟡 Low | Performance | List endpoints unbounded (no pagination) — orders list & full catalog fetch every row. | `orders.ts:134–142`, `persistCatalog` | Add keyset/limit pagination. |
| 13 | 🟠 Med | Reliability | No global Express error handler and no 404 handler. | `server.ts` | Add terminal `(err,req,res,next)` handler + JSON 404. |
| 14 | 🟠 Med | Reliability | No graceful shutdown; DB/Redis keepalive `setInterval`s never cleared. In-flight requests dropped on deploy. | `server.ts:69–80,118–131` | Handle `SIGTERM`: drain, clear intervals, close Redis; `.unref()` timers. |
| 15 | 🟠 Med | Observability | No error tracking/metrics; no real health/readiness endpoint; no request-id propagation. | throughout, `server.ts:63` | Add Sentry, a `/health` that pings DB+Redis, request id on logs + errors. |
| 16 | 🟠 Med | Ops | 4-min DB/Redis keepalive pings indicate an idling free tier — cold starts, dropped sockets. | `server.ts:67–80` | Run prod on non-idling tier; drop keepalive hack there. |
| 17 | 🟡 Low | Ops | CORS silently defaults to localhost if `CORS_ORIGIN` unset — misconfigured prod fails confusingly. | `server.ts:26–31` | Fail fast if `CORS_ORIGIN` unset in production. |
| 18 | 🟠 Med | Testing | Zero automated tests, no CI. | repo-wide | Add Vitest (auth guard, cart race, order ownership) + GitHub Actions running lint/build/test. |
| 19 | 🟠 Med | Build | `build` is `tsc --noEmit`; prod runs `tsx server.ts` — transpiling on the fly, no artifact. | `backend/package.json` | Emit compiled JS for prod; keep `tsx` for dev. |
| 20 | 🟡 Low | Types | Many `as unknown as ProductRow` casts bypass type safety at the data boundary. | `cart.ts:74`, `orders.ts:151,207` | Generate Supabase types; validate row shapes with zod. |
| 21 | 🟡 Low | Frontend | Supabase URL/key read with no guard — missing env fails opaquely at runtime. | `lil-edit/src/lib/supabase.ts:3–6` | Assert both env vars at startup with a clear error. |
| 22 | 🟡 Low | Frontend | Confirm top-level error boundary + uniform API-error surfacing + auth-state race guard. | `apiAuth.ts`, contexts | Add React error boundary + single `authFetch` wrapper (401→re-auth, consistent errors). |
| 23 | 🟡 Low | Logging | Logs include token fragments / emails / user ids. (Per keep-logs rule — redact, don't remove.) | `requireAuth.ts:30,44`, `apiAuth.ts:18` | Add log-level/redaction switch so prod doesn't persist PII/token fragments. |

---

## Fix-first order (highest ROI)

1. **#2 + #13** — sanitize error responses + add global error/404 handlers (low-risk, closes info-leak).
2. **#3 + #7** — `trust proxy` + Redis-backed rate limiter (current limiting is ineffective in any real deploy).
3. **#4** — money as integer minor-units, kill silent `|| 0` (do this *before* building checkout).
4. **#9** — atomic cart upsert (removes 500-on-race + read-then-write window).
5. **#14 + #15** — graceful shutdown + real `/health` + error tracking (basic operability).
6. **#18** — minimal CI (lint + build + a handful of tests) to lock in the above.

Then build checkout per `CHECKOUT_PLAN.md` — the plan itself is well-designed (atomic RPC, oversell guard, server-side pricing, idempotency on `transaction_id` are all the right calls).

---

## Biggest architectural item

**Finding #1** — running every user route on the RLS-bypassing service-role client. It works today because each query remembers its `.eq("user_id", …)`, but it's a single forgotten line away from a cross-account leak, and no test or DB policy would currently catch it. Worth addressing before launch.
