// Gmail SMTP mailer — the single place every transactional email goes through (order
// confirmation, admin status notifications). Sends FROM the shop's own Gmail address
// (shop.theliledit@gmail.com) via Nodemailer over Gmail's SMTP, authenticated with a
// Google App Password. Centralizing the transport + the from-address keeps senders
// consistent and makes the "is email configured?" check live in one spot.
//
// Safe-by-default: if GMAIL_APP_PASSWORD is unset the sender becomes a no-op that LOGS
// its intent and reports `sent: false`. The app therefore runs fine in dev with no
// email configured, and callers can surface "couldn't notify" without crashing.
//
// One-time setup on the Gmail account (the equivalent of "verify a domain"):
//   1. Enable 2-Step Verification on shop.theliledit@gmail.com.
//   2. Google Account → Security → App passwords → create one for "Mail".
//   3. Put the 16-char code in GMAIL_APP_PASSWORD (spaces optional). Optionally override
//      the sender with GMAIL_USER and the display name with MAIL_FROM_NAME.
// Note: a free Gmail account caps sending at ~500 recipients/day — ample for the
// transactional volume here, but it IS a ceiling worth knowing about.

import nodemailer from "nodemailer";
import { createLog, type OpLogger } from "./logger.js";

// The transporter's type, derived from the factory so we never need a named type import
// from nodemailer (it ships as a CommonJS export-assignment, which makes named type
// imports awkward under verbatimModuleSyntax).
type Mailer = ReturnType<typeof nodemailer.createTransport>;

// Config is read LAZILY (first send), never at import time. Capturing process.env at
// module load is fragile: ES module imports evaluate before the importing module's
// body runs, so a top-level read can execute before dotenv.config() has populated env,
// depending on import order. Resolving on first use sidesteps that class of bug.
let cached: { transporter: Mailer | null; from: string; replyTo: string[] } | null = null;

function config(): { transporter: Mailer | null; from: string; replyTo: string[] } {
  if (cached) return cached;
  // The Gmail address we send AS. Gmail forces the SMTP From to the authenticated
  // account (or a configured "Send mail as" alias), so this doubles as the auth user.
  const user = process.env.GMAIL_USER?.trim() || "shop.theliledit@gmail.com";
  // App Password — NOT the account password. Google displays it grouped as four blocks
  // ("abcd efgh ijkl mnop"); the spaces are cosmetic, so strip them and a pasted value
  // with or without spaces both authenticate.
  const appPassword = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");
  // Friendly display name on the From header → "The Lil Edit <shop.theliledit@gmail.com>".
  const fromName = process.env.MAIL_FROM_NAME?.trim() || "The Lil Edit";
  const from = `${fromName} <${user}>`;
  // Reply-To routes a customer's "Reply" AND "Reply All". Since we now send FROM the shop
  // inbox, replies already land there by default — but keep it overridable (comma-separated
  // for several) so support routing can change without touching the sender.
  const replyToRaw = process.env.MAIL_REPLY_TO?.trim() || user;
  const replyTo = replyToRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const transporter = appPassword
    ? nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true, // implicit TLS (SMTPS)
        auth: { user, pass: appPassword },
        // Bound every phase of the SMTP conversation so a hung connection can't outlive the
        // outer withTimeout (defence in depth; the race below is the hard cap).
        connectionTimeout: SEND_TIMEOUT_MS,
        greetingTimeout: SEND_TIMEOUT_MS,
        socketTimeout: SEND_TIMEOUT_MS,
      })
    : null;
  cached = { transporter, from, replyTo };
  return cached;
}

export function isMailerConfigured(): boolean {
  return config().transporter !== null;
}

// Hard cap on how long we'll wait for a send PER ATTEMPT, so a slow/hung SMTP server can
// never block the request that triggered it. On timeout the message may still complete on
// Gmail's side — we simply stop waiting and report it as unconfirmed (sent: false).
const SEND_TIMEOUT_MS = 10_000;

// Retry policy is built around exactly-once. WITHOUT a provider idempotency key, a retry is
// only safe when the message provably was NOT accepted by Gmail — so we retry just two
// definitively pre-acceptance classes and fail fast on everything else:
//   • a transient SMTP 4xx reply — the server explicitly rejected (greylisting, 421
//     service-unavailable, rate-limit, or a 4xx after the data block). We read a reply, so
//     we KNOW the message wasn't queued.
//   • a connection-ESTABLISHMENT error — the TCP/TLS connect, DNS lookup, or SMTP greeting
//     never completed, so no message DATA was ever transmitted.
// Everything else surfaces for a manual re-send (status + receipt both have a re-send
// action): permanent 5xx (auth 535, bad recipient 550, policy), and — crucially — the
// AMBIGUOUS mid-session errors (ESOCKET / ECONNRESET / a bare ETIMEDOUT). Those can fire
// AFTER Gmail accepted the message but before we read its 250, so retrying them could send a
// SECOND copy. Our own withTimeout sits in that same bucket (no code → not retried).
const MAX_SEND_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [500, 1500]; // waited before attempt 2, then attempt 3

// Connection-ESTABLISHMENT error codes only — these can occur only before any message data
// is sent (failed connect / DNS / greeting), so a re-send cannot duplicate. Deliberately
// EXCLUDES ESOCKET / ECONNRESET / ETIMEDOUT (mid-session, possibly post-acceptance).
const PRE_SEND_CONNECTION_CODES = new Set<string>([
  "ECONNECTION",  // nodemailer: failed to establish the connection / never got the greeting
  "ECONNREFUSED", // TCP refused — never connected
  "ENOTFOUND",    // DNS: host not found — never connected
  "EAI_AGAIN",    // DNS: temporary resolver failure — never connected
  "EDNS",         // nodemailer-wrapped DNS failure
]);

interface SmtpError {
  code?: string;
  responseCode?: number;
  message?: string;
  name?: string;
}

// Retry ONLY a definite-pre-acceptance failure (see the policy note above). A read SMTP
// reply is authoritative: 4xx → retry, anything else (5xx) → don't — and we never fall
// through to the code check. With no reply, retry only a connection-establishment code.
// Ambiguous mid-session errors and our timeout (no code/responseCode) return false, so a
// message Gmail may already have accepted is never re-sent. Exported for testing.
export function isRetriable(err: SmtpError): boolean {
  const rc = err.responseCode;
  if (typeof rc === "number") return rc >= 400 && rc < 500;
  return !!err.code && PRE_SEND_CONNECTION_CODES.has(err.code);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`timed out after ${ms}ms`);
      e.name = "TimeoutError";
      reject(e);
    }, ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  // Override the configured support Reply-To for this one send. One or many addresses
  // (Reply All reaches all of them). Defaults to MAIL_REPLY_TO when omitted.
  replyTo?: string | string[];
}

// Why a send didn't happen, so callers can show a precise message instead of a vague
// "couldn't send":
//   no_recipient   → the recipient address was empty (e.g. customer has no email on file)
//   not_configured → GMAIL_APP_PASSWORD unset (dev / not wired)
//   send_failed    → the SMTP send returned an error, or the attempt timed out / threw
export type SendFailureReason = "no_recipient" | "not_configured" | "send_failed";

export interface SendMailResult {
  sent: boolean;
  id?: string;
  error?: string;
  // Present only when sent === false.
  reason?: SendFailureReason;
}

/**
 * Send one transactional email via Gmail SMTP. Never throws — failures (missing app
 * password, empty recipient, SMTP error, timeout) come back as `{ sent: false, error }`
 * so the caller decides how to surface them. Pass a parent OpLogger to fold the log into
 * an op.
 */
export async function sendMail(input: SendMailInput, parentLog?: OpLogger): Promise<SendMailResult> {
  const log = parentLog ?? createLog();
  const to = input.to.trim();

  if (!to) {
    log.warn("mailer: no recipient address — skipping send");
    return { sent: false, error: "no recipient", reason: "no_recipient" };
  }

  const { transporter, from, replyTo } = config();
  if (!transporter) {
    log.warn(`mailer: GMAIL_APP_PASSWORD unset — would email "${to}" subject="${input.subject}" (not sent)`);
    return { sent: false, error: "mailer not configured", reason: "not_configured" };
  }

  // Per-send override wins; otherwise the configured support address(es). Omitted from the
  // payload entirely when there are none, so we never send an empty Reply-To.
  const effectiveReplyTo = input.replyTo ?? (replyTo.length ? replyTo : undefined);
  let lastError = "send failed";

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const info = await withTimeout(
        transporter.sendMail({
          from,
          to,
          subject: input.subject,
          html: input.html,
          ...(input.text ? { text: input.text } : {}),
          ...(effectiveReplyTo ? { replyTo: effectiveReplyTo } : {}),
        }),
        SEND_TIMEOUT_MS,
      );
      log.success(`mailer: sent to "${to}"  id=${info.messageId ?? "?"}  attempt=${attempt}/${MAX_SEND_ATTEMPTS}  subject="${input.subject}"`);
      return { sent: true, id: info.messageId };
    } catch (err) {
      const e = (err ?? {}) as SmtpError;
      lastError = e.message ?? String(err);
      const willRetry = isRetriable(e) && attempt < MAX_SEND_ATTEMPTS;
      const tag = e.code || (e.responseCode ? `SMTP ${e.responseCode}` : e.name) || "error";
      const line = `mailer: send failed to "${to}" (attempt ${attempt}/${MAX_SEND_ATTEMPTS}, ${tag}) : ${lastError}`;
      if (!willRetry) {
        // Not retriable: a permanent 5xx, an AMBIGUOUS mid-session error / timeout (could be
        // post-acceptance — retrying might send a second copy), or out of attempts. Surface
        // for a manual re-send rather than risk a duplicate.
        log.error(line);
        return { sent: false, error: lastError, reason: "send_failed" };
      }
      log.warn(line);
    }

    await sleep(RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1] ?? 1500);
  }

  // Exhausted retries on a transient error.
  log.error(`mailer: giving up after ${MAX_SEND_ATTEMPTS} attempts to "${to}" : ${lastError}`);
  return { sent: false, error: lastError, reason: "send_failed" };
}
