import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// Shared rate limiters. Defined here (not inline in server.ts) so routers can apply the
// tighter tiers to specific handlers — e.g. adminMutationLimiter goes on the admin PATCH
// routes only, leaving admin GETs (list/detail) on the global limiter.
//
// Tiers:
//   globalLimiter         — every route; generous ceiling to stop hammering
//   mutationLimiter       — user-facing writes (cart, wishlist, checkout)
//   authLimiter           — pre-auth endpoints (signup OTP): tight per-IP, since these
//                           front account creation and are the classic target for
//                           enumeration probing and OTP spam from a single source
//   otpSendLimiter        — OTP-send only, keyed per EMAIL (not IP): stops email
//                           bombing a single victim even from many IPs / a botnet
//   adminMutationLimiter  — admin status/payment PATCH only; tightest, since a stolen
//                           admin token doing a few hundred RPCs would spam the audit
//                           trail and cause significant DB write pressure
//
// windowMs=15 minutes is the standard; shorter windows reset faster after a genuine
// spike but give weaker protection against sustained abuse.
//
// STORE: in-memory (per-process). Paired with `app.set("trust proxy", 1)` in server.ts it
// keys on the REAL client IP (not the proxy), so it's effective on a single instance — this
// is what closes the "everyone shares one bucket / X-Forwarded-For is spoofable" gap. The
// in-memory counts reset on restart and aren't shared across instances, which only matters
// once you run MULTIPLE instances; at that point move the counts to Redis (rate-limit-redis).
// Note for that upgrade: rate-limit-redis runs a SCRIPT LOAD from its constructor, so it
// needs its OWN ioredis connection with the offline queue ENABLED — the shared cache client
// (lib/redis.ts) is lazyConnect + enableOfflineQueue:false and will throw at import time.
const WINDOW_MS = 15 * 60 * 1000;

function makeLimiter(limit: number, message: string) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",  // Return RateLimit-* headers (RFC 9110 draft)
    legacyHeaders: false,
    message: { error: message },
    // Log every throttle so it's verifiable: the resolved client IP proves `trust proxy`
    // is unmasking X-Forwarded-For (not keying everything to the proxy's IP).
    handler: (req, res) => {
      console.warn(`[rate-limit] 429 THROTTLED  ip=${req.ip}  ${req.method} ${req.originalUrl}  (limit ${limit}/15min)`);
      res.status(429).json({ error: message });
    },
  });
}

export const globalLimiter = makeLimiter(500, "Too many requests — please slow down.");          // 500 req / IP / 15 min, all routes
export const mutationLimiter = makeLimiter(100, "Too many requests — please slow down.");          // 100 writes / IP / 15 min
export const authLimiter = makeLimiter(30, "Too many attempts — please wait a few minutes and try again."); // 30 auth calls / IP / 15 min
export const adminMutationLimiter = makeLimiter(60, "Too many admin requests — please slow down."); // 60 admin writes / IP / 15 min

// OTP send, keyed by EMAIL rather than IP. Email bombing (flooding one inbox with
// codes) is per-victim, not per-source, so an IP cap alone doesn't stop a botnet from
// hammering one address — this does. Supabase's own per-email send cap backstops it,
// but we don't want to lean on the upstream limit alone. The key falls back to the
// (IPv6-normalized) client IP when no email is present so a malformed body can't dodge it.
const OTP_PER_EMAIL_LIMIT = 6; // send + a few resends within the window is plenty for a real user
export const otpSendLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: OTP_PER_EMAIL_LIMIT,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    // ipKeyGenerator normalizes IPv6 into a stable /64 subnet key (v8 requirement for
    // any IP-derived key). Prefixed so the email and IP keyspaces never collide.
    return email ? `email:${email}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  handler: (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "(none)";
    console.warn(`[rate-limit] 429 OTP THROTTLED  email=${email}  ip=${req.ip}  (limit ${OTP_PER_EMAIL_LIMIT}/15min per email)`);
    res.status(429).json({ error: "Too many code requests for this email — please wait a few minutes and try again." });
  },
});

// One-time startup line so the limiter config is visible at boot.
console.log("[rate-limit] store=memory (per-process; trust-proxy keys on real client IP — move to Redis for multi-instance, see rateLimiters.ts)  tiers: global=500 mutation=100 auth=30/ip otp=6/email admin=60 per 15min");
