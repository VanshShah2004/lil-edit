// Order confirmation email — STUB (wiring intentionally deferred).
//
// Called fire-and-forget right after a successful placement, so the checkout flow
// never blocks on — or fails because of — email delivery. It currently just logs
// intent. Resend is already a backend dependency (see package.json) and used by the
// auth flow, so finishing this is a one-liner: build the template and send to
// `recipientEmail`.
//
// TODO: wire Resend — send the order summary below to order.recipientEmail.

import { createLog } from "./logger.js";

export interface OrderConfirmationPayload {
  orderId: string;
  orderNumber: string;
  recipientEmail: string;
  total: number;
  itemCount: number;
}

/**
 * Fire-and-forget post-placement hook. Awaitable, but callers deliberately do NOT
 * await it (a slow/failing mail send must never roll back a paid, placed order).
 */
export async function sendOrderConfirmation(order: OrderConfirmationPayload): Promise<void> {
  const log = createLog().start("ORDER EMAIL");
  // TODO: wire Resend, e.g.
  //   await resend.emails.send({ from, to: order.recipientEmail, subject, html });
  log.step(`(stub) would email "${order.recipientEmail || "<no email on file>"}"  order=${order.orderNumber}  items=${order.itemCount}  total=₹${order.total}`);
  log.success("stub — no email sent (Resend not wired yet)").end("ORDER EMAIL");
}
