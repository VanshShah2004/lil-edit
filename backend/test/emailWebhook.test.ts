import { test } from "node:test";
import assert from "node:assert/strict";
import { eventToStatus, computeSvixSignature, verifySvix, nextDeliveryStatus } from "../routes/emailWebhook.js";
import { createLog } from "../lib/logger.js";

const log = createLog();
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"; // Svix docs' example secret

test("computeSvixSignature matches Svix's published test vector", () => {
  const sig = computeSvixSignature(SECRET, "msg_p5jXN8AQM9LWM0D4loKWxJek", "1614265330", '{"test": 2432232314}');
  assert.equal(sig, "g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
});

test("eventToStatus strips the email. prefix", () => {
  assert.equal(eventToStatus("email.delivered"), "delivered");
  assert.equal(eventToStatus("email.bounced"), "bounced");
  assert.equal(eventToStatus("unprefixed"), "unprefixed");
});

test("nextDeliveryStatus: latest-wins, but a soft event never downgrades a terminal one", () => {
  assert.equal(nextDeliveryStatus("", "sent"), "sent");
  assert.equal(nextDeliveryStatus("sent", "delivered"), "delivered");
  assert.equal(nextDeliveryStatus("bounced", "opened"), "bounced");       // opened can't hide a bounce
  assert.equal(nextDeliveryStatus("delivered", "complained"), "complained"); // complaint outranks delivered
});

function headers(id: string, ts: string, sig: string) {
  return { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig } as Record<string, string>;
}
const nowTs = () => String(Math.floor(Date.now() / 1000));

test("verifySvix accepts a correctly-signed current event", () => {
  const ts = nowTs();
  const body = '{"type":"email.delivered","data":{}}';
  const sig = `v1,${computeSvixSignature(SECRET, "msg1", ts, body)}`;
  assert.equal(verifySvix(SECRET, Buffer.from(body), headers("msg1", ts, sig), log), true);
});

test("verifySvix rejects a tampered signature", () => {
  assert.equal(verifySvix(SECRET, Buffer.from("{}"), headers("m", nowTs(), "v1,deadbeef"), log), false);
});

test("verifySvix rejects a stale timestamp (replay guard)", () => {
  const ts = "1614265330"; // 2021 — far outside the 5-min window
  const sig = `v1,${computeSvixSignature(SECRET, "m", ts, "{}")}`;
  assert.equal(verifySvix(SECRET, Buffer.from("{}"), headers("m", ts, sig), log), false);
});

test("verifySvix rejects missing headers", () => {
  assert.equal(verifySvix(SECRET, Buffer.from("{}"), {}, log), false);
});
