import { test } from "node:test";
import assert from "node:assert/strict";
import { sendMail } from "../lib/mailer.js";

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
