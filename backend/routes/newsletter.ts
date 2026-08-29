import { Router, type Request, type Response } from "express";
import { resolveMx } from "node:dns/promises";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { logActivity } from "../lib/activityLog.js";
import { createLog, fms } from "../lib/logger.js";
import { performance } from "perf_hooks";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common misspellings of popular mail domains → the intended domain. We reject these
// outright with a helpful "did you mean" so a typo'd address (which will silently
// bounce forever) never enters the list.
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
};

// Verify the domain can actually receive mail: it must publish MX records (or, as a
// fallback, resolve to an A record — RFC 5321 allows implicit MX). Returns true if
// the DNS lookup itself fails for a transient reason, so a flaky resolver never blocks
// a real signup (fail-open on infrastructure, fail-closed only on a definite "no such
// domain / no mail servers").
async function domainCanReceiveMail(domain: string): Promise<boolean> {
  try {
    const mx = await resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch (err) {
    const code = (err as { code?: string }).code;
    // ENOTFOUND / ENODATA = the domain definitively has no mail servers → reject.
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    // Anything else (timeout, SERVFAIL, resolver down) → don't punish the user.
    return true;
  }
}

// ─── POST /api/newsletter/subscribe ────────────────────────────────────────────
// Guests (no Bearer token) may subscribe any email — the anonymous footer form.
// A logged-in caller may only subscribe THEIR OWN account email, never someone
// else's, even though this route writes via the service-role client (which bypasses
// the matching DB-level RLS policy) — so the check has to be re-done here in app code.
router.post("/subscribe", async (req: Request, res: Response) => {
  const log = createLog().start("NEWSLETTER SUBSCRIBE");
  const { email } = req.body as { email?: string };

  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized || !EMAIL_RE.test(normalized)) {
    log.warn("invalid email").end("NEWSLETTER SUBSCRIBE");
    res.status(400).json({ error: "Please enter a valid email address" });
    return;
  }

  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);

  // 1) Obvious typo of a well-known provider → reject with a "did you mean".
  const suggestedDomain = DOMAIN_TYPOS[domain];
  if (suggestedDomain) {
    const suggestion = `${normalized.slice(0, normalized.lastIndexOf("@"))}@${suggestedDomain}`;
    log.warn(`typo domain=${domain} → suggest ${suggestedDomain}`).end("NEWSLETTER SUBSCRIBE");
    res.status(400).json({ error: `Did you mean ${suggestion}?` });
    return;
  }

  // 2) The domain must actually be able to receive mail (has MX records). Catches
  //    made-up domains that pass the format check but would bounce forever.
  const t0mx = performance.now();
  const canReceive = await domainCanReceiveMail(domain);
  log.step(`MX check ${domain}: ${canReceive ? "ok" : "NO mail servers"}  ${fms(performance.now() - t0mx)}`);
  if (!canReceive) {
    log.warn(`domain can't receive mail: ${domain}`).end("NEWSLETTER SUBSCRIBE");
    res.status(400).json({ error: "That email domain doesn't seem to exist — please double-check it." });
    return;
  }

  // Attribution for the activity feed. Stays null for the logged-out footer form —
  // a guest subscribe is still worth a row, just an anonymous one.
  let subscriberId: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data: { user }, error: authErr } = await (supabaseAdmin ?? supabaseAnon).auth.getUser(token);

    if (authErr || !user) {
      log.warn("DENY - invalid/expired token").end("NEWSLETTER SUBSCRIBE");
      res.status(401).json({ error: "Unauthorized — invalid or expired token" });
      return;
    }

    const ownEmail = user.email?.trim().toLowerCase();
    if (ownEmail !== normalized) {
      log.warn(`DENY - user=${user.id} tried to subscribe email≠own account`).end("NEWSLETTER SUBSCRIBE");
      res.status(403).json({ error: "You can only subscribe your own account email" });
      return;
    }
    subscriberId = user.id;
  }

  try {
    const t0 = performance.now();
    const { error } = await db()
      .from("newsletter_subscribers")
      .insert({ email: normalized });
    log.step(`DB insert: ${fms(performance.now() - t0)}`);

    if (error) {
      if (error.code === "23505") {
        log.step("already subscribed — returning 200").end("NEWSLETTER SUBSCRIBE");
        res.json({ ok: true, action: "already_subscribed" });
        return;
      }
      log.error(`insert failed  code=${error.code}  msg=${error.message}`, error).end("NEWSLETTER SUBSCRIBE");
      res.status(500).json({ error: error.message });
      return;
    }

    log.success(`subscribed  email=${normalized}  total=${fms(log.elapsed())}`).end("NEWSLETTER SUBSCRIBE");
    // Only a genuinely NEW subscription is logged — the 23505 branch above returns
    // early, so re-submitting the form doesn't add a row each time. The signup
    // auto-subscribe (handle_new_user_profile) isn't logged here either; it shows up
    // as the 'signup' event instead.
    void logActivity({
      type: "newsletter_subscribed",
      userId: subscriberId,
      metadata: { email: normalized, source: subscriberId ? "account" : "guest" },
    });
    res.status(201).json({ ok: true, action: "subscribed" });
  } catch (err) {
    log.error("unhandled error", err).end("NEWSLETTER SUBSCRIBE");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
