import { Router, type Request, type Response } from "express";
import { resolveMx } from "node:dns/promises";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { mutationLimiter } from "../middleware/rateLimiters.js";
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
router.post("/subscribe", mutationLimiter, async (req: Request, res: Response) => {
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

// ─── GET /api/newsletter/subscribers ───────────────────────────────────────────
// Admin-only read of the mailing list, for the General Settings panel and its
// Excel/CSV export. newsletter_subscribers is RLS-locked to anon INSERT only —
// there is no client-readable policy — so this deliberately reads through the
// service-role client, with requireAuth + requireAdmin as the actual gate.
//
// Each subscriber is matched back to a profile (by email) so the panel can show a
// name and tell an account holder apart from a guest who only ever used the footer
// form. A subscriber with no profile row is not an error: the footer form takes any
// email, account or not.
router.get("/subscribers", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const log = createLog().start("NEWSLETTER LIST");

  // The read needs the service role: RLS exposes no SELECT policy to any client role,
  // so the anon fallback would silently return zero rows rather than fail loudly.
  if (!supabaseAdmin) {
    log.error("SUPABASE_SERVICE_ROLE_KEY not configured — subscriber list unreadable").end("NEWSLETTER LIST");
    res.status(503).json({
      error:
        "The subscriber list can't be read: the backend is missing SUPABASE_SERVICE_ROLE_KEY. Set it in backend/.env and restart.",
    });
    return;
  }

  try {
    const t0 = performance.now();
    const { data: rows, error } = await supabaseAdmin
      .from("newsletter_subscribers")
      .select("id, email, created_at")
      .order("created_at", { ascending: false });
    log.step(`DB subscribers: ${rows?.length ?? 0} rows  ${fms(performance.now() - t0)}`);

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        log.warn("newsletter_subscribers missing — migration not applied").end("NEWSLETTER LIST");
        res.status(503).json({
          error:
            "The newsletter table doesn't exist yet. Run lil-edit/supabase/migrations/20260705_newsletter_subscribers.sql in Supabase.",
        });
        return;
      }
      log.error(`select failed  code=${error.code}  msg=${error.message}`, error).end("NEWSLETTER LIST");
      res.status(500).json({ error: error.message });
      return;
    }

    const subscribers = rows ?? [];
    const emails = subscribers.map((r) => r.email);

    // Match to profiles in chunks — a single .in() with thousands of emails builds a
    // URL long enough for PostgREST to reject, so never let the list size decide.
    const CHUNK = 200;
    const profileByEmail = new Map<string, { first_name: string | null; last_name: string | null }>();
    const t1 = performance.now();
    for (let i = 0; i < emails.length; i += CHUNK) {
      const slice = emails.slice(i, i + CHUNK);
      const { data: profs, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("email, first_name, last_name")
        .in("email", slice);
      if (profErr) {
        // A failed name lookup must not cost the admin the whole list — the emails
        // (the part that actually matters for a mailout) are already in hand.
        log.warn(`profile chunk ${i}-${i + slice.length} failed: ${profErr.message}`);
        continue;
      }
      for (const p of profs ?? []) {
        profileByEmail.set(String(p.email).trim().toLowerCase(), {
          first_name: p.first_name,
          last_name: p.last_name,
        });
      }
    }
    log.step(`DB profiles: ${profileByEmail.size} matched  ${fms(performance.now() - t1)}`);

    const list = subscribers.map((r) => {
      const prof = profileByEmail.get(r.email.trim().toLowerCase());
      return {
        id: r.id,
        email: r.email,
        createdAt: r.created_at,
        firstName: prof?.first_name ?? null,
        lastName: prof?.last_name ?? null,
        hasAccount: Boolean(prof),
      };
    });

    const withAccount = list.filter((s) => s.hasAccount).length;
    log
      .success(`${list.length} subscribers  withAccount=${withAccount}  guests=${list.length - withAccount}  total=${fms(log.elapsed())}`)
      .end("NEWSLETTER LIST");

    res.json({
      subscribers: list,
      total: list.length,
      withAccount,
      guests: list.length - withAccount,
    });
  } catch (err) {
    log.error("unhandled error", err).end("NEWSLETTER LIST");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
