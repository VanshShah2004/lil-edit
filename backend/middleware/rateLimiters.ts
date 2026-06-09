import { rateLimit } from "express-rate-limit";

// Shared rate limiters. Defined here (not inline in server.ts) so routers can apply the
// tighter tiers to specific handlers — e.g. adminMutationLimiter goes on the admin PATCH
// routes only, leaving admin GETs (list/detail) on the global limiter.
//
// Three tiers:
//   globalLimiter         — every route; generous ceiling to stop hammering
//   mutationLimiter       — user-facing writes (cart, wishlist)
//   adminMutationLimiter  — admin status/payment PATCH only; tightest, since a stolen
//                           admin token doing a few hundred RPCs would spam the audit
//                           trail and cause significant DB write pressure
//
// windowMs=15 minutes is the standard; shorter windows reset faster after a genuine
// spike but give weaker protection against sustained abuse.
const WINDOW_MS = 15 * 60 * 1000;

export const globalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 500,                  // 500 req / IP / window across all routes
  standardHeaders: "draft-8",  // Return RateLimit-* headers (RFC 9110 draft)
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

export const mutationLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 100,                  // 100 writes / IP / 15 min
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

export const adminMutationLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 60,                   // 60 admin writes / IP / 15 min (~1 every 15 s sustained)
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many admin requests — please slow down." },
});
