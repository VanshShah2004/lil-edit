// Thin Resend wrapper — the single place every transactional email goes through
// (order confirmation, admin status notifications). Centralizing the client + the
// from-address keeps senders consistent and makes the "is email configured?" check
// live in one spot.
//
// Safe-by-default: if RESEND_API_KEY is unset the sender becomes a no-op that LOGS
// its intent and reports `sent: false`. The app therefore runs fine in dev with no
// email configured, and callers can surface "couldn't notify" without crashing.

import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { createLog, type OpLogger } from "./logger.js";

// Config is read LAZILY (first send), never at import time. Capturing process.env at
// module load is fragile: ES module imports evaluate before the importing module's
// body runs, so a top-level read can execute before dotenv.config() has populated env,
// depending on import order. Resolving on first use sidesteps that class of bug.
let cached: { client: Resend | null; from: string; replyTo: string[] } | null = null;

function config(): { client: Resend | null; from: string; replyTo: string[] } {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  // Resend's shared sandbox sender works without verifying a domain — handy for testing
  // (note: in that mode Resend only delivers to your own account email). For production,
  // verify a domain in the Resend dashboard and set RESEND_FROM to an address on it.
  const from = process.env.RESEND_FROM?.trim() || "The Lil Edit <onboarding@resend.dev>";
  // Reply-To routes a customer's "Reply" AND "Reply All" to a real support inbox. Unlike
  // From, it needs NO domain verification (it's just a header), so a plain Gmail works —
  // which is perfect here: we can't SEND from Gmail via Resend, but we CAN receive replies
  // there. Comma-separated → multiple addresses, so Reply All reaches them all.
  const replyToRaw = process.env.RESEND_REPLY_TO?.trim() || "shop.theliledit@gmail.com";
  const replyTo = replyToRaw.split(",").map((s) => s.trim()).filter(Boolean);
  cached = { client: apiKey ? new Resend(apiKey) : null, from, replyTo };
  return cached;
}

export function isMailerConfigured(): boolean {
  return config().client !== null;
}

// Hard cap on how long we'll wait for Resend PER ATTEMPT, so a slow/hung API can never
// block the request that triggered the send. On timeout the email may still complete on
// Resend's side — we simply stop waiting and report it as unconfirmed (sent: false).
const SEND_TIMEOUT_MS = 10_000;

// Transient failures (Resend 5xx / throttling) get a couple of quick retries — the
// message almost certainly never left, and these respond fast so latency stays low.
// PERMANENT failures (bad address, auth, quota, validation, sandbox restriction) are
// NOT retried: an identical retry would just fail again. A TIMEOUT is also not retried
// on the request path — it's slow AND ambiguous (the send may already have gone), and
// there's an explicit admin re-send action to fall back on.
const MAX_SEND_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [500, 1500]; // waited before attempt 2, then attempt 3

// Resend error `name`s that signal a transient, retry-worthy server/throttle condition.
const RETRIABLE_ERROR_NAMES = new Set<string>([
  "rate_limit_exceeded",
  "application_error",
  "internal_server_error",
  "concurrent_idempotent_requests",
]);

// Retry on a known-transient error name, or any 429 / 5xx status.
function isRetriable(error: { name: string; statusCode: number | null }): boolean {
  if (RETRIABLE_ERROR_NAMES.has(error.name)) return true;
  const code = error.statusCode;
  return code != null && (code === 429 || code >= 500);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  // Override the configured support Reply-To for this one send. One or many addresses
  // (Reply All reaches all of them). Defaults to RESEND_REPLY_TO when omitted.
  replyTo?: string | string[];
}

// Why a send didn't happen, so callers can show a precise message instead of a vague
// "couldn't send":
//   no_recipient   → the recipient address was empty (e.g. customer has no email on file)
//   not_configured → RESEND_API_KEY unset (dev / not wired)
//   send_failed    → Resend returned an error, or the attempt timed out / threw
export type SendFailureReason = "no_recipient" | "not_configured" | "send_failed";

export interface SendMailResult {
  sent: boolean;
  id?: string;
  error?: string;
  // Present only when sent === false.
  reason?: SendFailureReason;
}

/**
 * Send one transactional email through Resend. Never throws — failures (missing key,
 * empty recipient, Resend error, timeout) come back as `{ sent: false, error }` so the
 * caller decides how to surface them. Pass a parent OpLogger to fold the log into an op.
 */
export async function sendMail(input: SendMailInput, parentLog?: OpLogger): Promise<SendMailResult> {
  const log = parentLog ?? createLog();
  const to = input.to.trim();

  if (!to) {
    log.warn("mailer: no recipient address — skipping send");
    return { sent: false, error: "no recipient", reason: "no_recipient" };
  }

  const { client, from, replyTo } = config();
  if (!client) {
    log.warn(`mailer: RESEND_API_KEY unset — would email "${to}" subject="${input.subject}" (not sent)`);
    return { sent: false, error: "mailer not configured", reason: "not_configured" };
  }

  // Per-send override wins; otherwise the configured support address(es). Omitted from the
  // payload entirely when there are none, so we never send an empty Reply-To.
  const effectiveReplyTo = input.replyTo ?? (replyTo.length ? replyTo : undefined);

  // One idempotency key per logical send, REUSED across this call's retries: if a retried
  // attempt's predecessor actually reached Resend, the retry is deduped rather than sending
  // a second copy (Resend honors the key for 24h). A separate, later re-send is a NEW
  // sendMail call → new key → genuinely sends again.
  const idempotencyKey = randomUUID();
  let lastError = "send failed";

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    // Pre-attach a no-op catch so that if the timeout wins the race, a later rejection on
    // this promise can't surface as an unhandledRejection.
    const sendP = client.emails.send(
      {
        from,
        to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(effectiveReplyTo ? { replyTo: effectiveReplyTo } : {}),
      },
      { idempotencyKey },
    );
    sendP.catch(() => { /* handled via the race below; this just prevents a late unhandled rejection */ });

    try {
      const { data, error } = await withTimeout(sendP, SEND_TIMEOUT_MS);
      if (!error) {
        log.success(`mailer: sent to "${to}"  id=${data?.id ?? "?"}  attempt=${attempt}/${MAX_SEND_ATTEMPTS}  subject="${input.subject}"`);
        return { sent: true, id: data?.id };
      }
      // Resend's error is a plain object, not an Error — inline the message so the log
      // line is readable (the logger would render the raw object as "[object Object]").
      lastError = error.message;
      const willRetry = isRetriable(error) && attempt < MAX_SEND_ATTEMPTS;
      const line = `mailer: send failed to "${to}" (attempt ${attempt}/${MAX_SEND_ATTEMPTS}, ${error.name}) : ${error.message}`;
      if (!willRetry) {
        log.error(line);
        return { sent: false, error: error.message, reason: "send_failed" };
      }
      log.warn(line);
    } catch (err) {
      // Thrown = our timeout or a network error. We don't keep burning the request's time
      // retrying a timeout (slow + ambiguous) — surface it; the admin can re-send.
      lastError = err instanceof Error ? err.message : String(err);
      log.error(`mailer: send threw/timed out for "${to}" (attempt ${attempt}/${MAX_SEND_ATTEMPTS})`, err);
      return { sent: false, error: lastError, reason: "send_failed" };
    }

    await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1] ?? 1500);
  }

  // Exhausted retries on a transient error.
  log.error(`mailer: giving up after ${MAX_SEND_ATTEMPTS} attempts to "${to}" : ${lastError}`);
  return { sent: false, error: lastError, reason: "send_failed" };
}
