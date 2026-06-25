import { createHmac, timingSafeEqual } from "node:crypto";
import { type Request, type Response, type RequestHandler } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { createLog, type OpLogger } from "../lib/logger.js";

// ─── Resend delivery webhook ───────────────────────────────────────────────────────
// Receives Resend's async delivery events (delivered / bounced / complained / opened …)
// and records the latest status per email in `email_deliveries`, so "accepted by Resend"
// can be upgraded to "actually arrived / bounced". Mounted in server.ts with a RAW body
// parser BEFORE express.json (the signature is computed over the raw bytes), ahead of the
// rate limiters (webhook retries must never be throttled).

const db = () => supabaseAdmin ?? supabaseAnon;

// Reject events whose signed timestamp is more than this far from now (replay guard).
const SIGNATURE_TOLERANCE_S = 5 * 60;

// "email.<event>" → short status. Unknown types keep their suffix so new Resend events
// still record something sensible.
export function eventToStatus(type: string): string {
  return type.startsWith("email.") ? type.slice("email.".length) : type;
}

// Latest-wins, EXCEPT a soft signal (sent/delayed/opened/clicked) must never overwrite a
// terminal/negative outcome already recorded (delivered/bounced/complained/failed) —
// webhook events can arrive out of order.
const STATUS_RANK: Record<string, number> = {
  sent: 1, scheduled: 1, delivery_delayed: 2, opened: 3, clicked: 3,
  delivered: 4, complained: 5, bounced: 5, failed: 5,
};

// Merge an incoming event status with the recorded one (see STATUS_RANK). Exported for testing.
export function nextDeliveryStatus(prev: string, incoming: string): string {
  if (prev && (STATUS_RANK[prev] ?? 0) > (STATUS_RANK[incoming] ?? 0)) return prev;
  return incoming;
}

// Constant-time compare of two base64 signatures (length-guarded so timingSafeEqual
// never throws on a mismatch).
function safeEqualB64(a: string, b: string): boolean {
  const ba = Buffer.from(a, "base64");
  const bb = Buffer.from(b, "base64");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

// base64(HMAC_SHA256(base64decode(secret without "whsec_"), `${id}.${ts}.${body}`)) — the
// Svix signing scheme Resend uses. Exported so a test can pin it to Svix's published vector.
export function computeSvixSignature(secret: string, id: string, ts: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
}

// Verify a Svix-signed request: the `svix-signature` header is a space-separated list of
// "v1,<sig>" tokens (supports key rotation) — any match passes — and the signed timestamp
// must be within the replay window. Exported for testing.
export function verifySvix(secret: string, rawBody: Buffer, headers: Request["headers"], log: OpLogger): boolean {
  const id = String(headers["svix-id"] ?? headers["webhook-id"] ?? "");
  const ts = String(headers["svix-timestamp"] ?? headers["webhook-timestamp"] ?? "");
  const sigHeader = String(headers["svix-signature"] ?? headers["webhook-signature"] ?? "");
  if (!id || !ts || !sigHeader) { log.warn("missing svix-id/timestamp/signature header(s)"); return false; }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > SIGNATURE_TOLERANCE_S) {
    log.warn(`signed timestamp outside tolerance  ts=${ts}`);
    return false;
  }

  const expected = computeSvixSignature(secret, id, ts, rawBody.toString("utf8"));
  return sigHeader.split(" ").some((token) => {
    const comma = token.indexOf(",");
    if (comma === -1) return false;
    return token.slice(0, comma) === "v1" && safeEqualB64(token.slice(comma + 1), expected);
  });
}

export const resendWebhookHandler: RequestHandler = async (req: Request, res: Response) => {
  const log = createLog().start("EMAIL WEBHOOK");

  // Read lazily (not at import time): top-level process.env reads can run before
  // dotenv.config() populates env, depending on import order (see lib/mailer.ts).
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    log.error("RESEND_WEBHOOK_SECRET unset — rejecting").end("EMAIL WEBHOOK");
    res.status(503).json({ error: "Webhook not configured." });
    return;
  }

  const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from(String(req.body ?? ""));
  if (!verifySvix(secret, raw, req.headers, log)) {
    log.warn("bad signature — rejecting").end("EMAIL WEBHOOK");
    res.status(400).json({ error: "Invalid signature." });
    return;
  }
  log.step("signature verified ✓");

  let event: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    log.warn("unparseable body").end("EMAIL WEBHOOK");
    res.status(400).json({ error: "Bad body." });
    return;
  }

  const type = String(event.type ?? "");
  const data = (event.data ?? {}) as Record<string, unknown>;
  const resendId = String((data.email_id as string) ?? (data.id as string) ?? "");
  if (!resendId) {
    log.warn(`no email id on event type=${type}`).end("EMAIL WEBHOOK");
    res.status(200).json({ ok: true }); // ack so Resend stops retrying — nothing to record
    return;
  }

  const status = eventToStatus(type);
  const toArr = Array.isArray(data.to) ? (data.to as string[]) : data.to ? [String(data.to)] : [];
  const toEmail = toArr.join(", ");
  const subject = String((data.subject as string) ?? "");
  // Bounce/complaint detail varies in shape across Resend versions — take the first hit.
  const bounce = (data.bounce ?? {}) as Record<string, unknown>;
  const detail =
    (typeof bounce.message === "string" && bounce.message) ||
    (typeof data.reason === "string" && (data.reason as string)) ||
    (typeof bounce.type === "string" && (bounce.type as string)) ||
    null;
  const eventTime = (() => {
    if (event.created_at) {
      const d = new Date(event.created_at);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
  })();

  log.step(`event=${type}  id=${resendId}  to="${toEmail}"  status=${status}${detail ? `  detail="${String(detail).slice(0, 80)}"` : ""}`);

  try {
    // Read existing first so a late soft event can't downgrade a terminal status, and so
    // we carry forward fields the current event may omit.
    const { data: existing } = await db()
      .from("email_deliveries")
      .select("status, detail, to_email, subject")
      .eq("resend_id", resendId)
      .maybeSingle();
    const prev = (existing?.status as string) ?? "";
    const row = {
      resend_id: resendId,
      to_email: toEmail || (existing?.to_email as string) || "",
      subject: subject || (existing?.subject as string) || "",
      status: nextDeliveryStatus(prev, status),
      detail: detail ?? (existing?.detail as string) ?? null,
      last_event_at: eventTime,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db().from("email_deliveries").upsert(row, { onConflict: "resend_id" });
    if (error) log.warn(`upsert failed (table missing?): ${error.message}`);
    else log.success(`recorded  id=${resendId}  status=${row.status}`);
  } catch (e) {
    log.warn(`record threw: ${e instanceof Error ? e.message : String(e)}`);
  }

  log.end("EMAIL WEBHOOK");
  res.status(200).json({ ok: true });
};
