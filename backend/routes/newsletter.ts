import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { createLog, fms } from "../lib/logger.js";
import { performance } from "perf_hooks";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    res.status(201).json({ ok: true, action: "subscribed" });
  } catch (err) {
    log.error("unhandled error", err).end("NEWSLETTER SUBSCRIBE");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
