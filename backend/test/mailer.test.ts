import { test } from "node:test";
import assert from "node:assert/strict";
import { sendMail, isRetriable } from "../lib/mailer.js";

// Deterministic no-op path regardless of shell/.env: clear the app password BEFORE the
// mailer's lazy config runs (it reads env on the first send, which happens inside a test body).
delete process.env.GMAIL_APP_PASSWORD;

test("sendMail returns no_recipient for an empty address (no network)", async () => {
  const r = await sendMail({ to: "   ", subject: "Hi", html: "<p>x</p>" });
  assert.equal(r.sent, false);
  assert.equal(r.reason, "no_recipient");
});

test("sendMail returns not_configured when GMAIL_APP_PASSWORD is unset", async () => {
  const r = await sendMail({ to: "customer@example.com", subject: "Hi", html: "<p>x</p>" });
  assert.equal(r.sent, false);
  assert.equal(r.reason, "not_configured");
});

// The exactly-once retry policy: retry ONLY failures that provably happened before Gmail
// could accept the message, so a retry can never produce a duplicate.
test("isRetriable: retries only definite pre-acceptance failures (no-dup policy)", () => {
  // Authoritative SMTP replies — we read the server's verdict, so no ambiguity.
  assert.equal(isRetriable({ responseCode: 421 }), true);  // service unavailable → not queued
  assert.equal(isRetriable({ responseCode: 450 }), true);  // greylisting → not queued
  assert.equal(isRetriable({ responseCode: 454 }), true);  // rate limit → not queued
  assert.equal(isRetriable({ responseCode: 535 }), false); // auth — permanent
  assert.equal(isRetriable({ responseCode: 550 }), false); // bad recipient — permanent

  // Connection-establishment errors — never reached DATA, so safe to retry.
  assert.equal(isRetriable({ code: "ECONNECTION" }), true);
  assert.equal(isRetriable({ code: "ECONNREFUSED" }), true);
  assert.equal(isRetriable({ code: "ENOTFOUND" }), true);
  assert.equal(isRetriable({ code: "EAI_AGAIN" }), true);

  // Ambiguous mid-session errors — could fire AFTER Gmail accepted the message → must NOT
  // retry (this is the duplicate we're closing).
  assert.equal(isRetriable({ code: "ESOCKET" }), false);
  assert.equal(isRetriable({ code: "ECONNRESET" }), false);
  assert.equal(isRetriable({ code: "ETIMEDOUT" }), false);

  // A 5xx reply outranks any code; our own timeout / empty errors are never retried.
  assert.equal(isRetriable({ code: "ESOCKET", responseCode: 550 }), false);
  assert.equal(isRetriable({ name: "TimeoutError", message: "timed out after 10000ms" }), false);
  assert.equal(isRetriable({}), false);
});
