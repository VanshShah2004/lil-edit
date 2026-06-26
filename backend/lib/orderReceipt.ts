// Order-confirmation receipt BACKSTOP.
//
// The receipt is normally sent fire-and-forget from checkout's afterPlacement() right after
// a successful placement. That send is detached and best-effort: if the process is interrupted
// between place_order committing and the email going out — or if /verify placed the order but
// returned before its detached send ran — the receipt can be silently lost. The webhook does
// NOT recover it today: it backs up order CREATION (findPlacedOrder short-circuit), not the
// notification, so once the order exists the webhook just acks and returns.
//
// This closes that gap. Called (fire-and-forget) from the webhook's and /verify's
// "already placed" paths, it sends the receipt IFF none was ever recorded for the order —
// reusing the kind='receipt' row in order_notifications as the durable "was it delivered?"
// signal. In the common case (afterPlacement already sent + recorded it) the recorded row
// makes this a no-op, so there is NO duplicate on the happy path.
//
// Accepted residual (see the airtightness review): a rare, BENIGN duplicate is possible if
// this runs while afterPlacement's send is still in flight (the receipt row isn't written
// yet) — strictly preferable to the prior behaviour of a permanent silent loss.
//
// Never throws (best-effort, same posture as afterPlacement). Fails CLOSED on a guard read
// error: an AUTOMATIC re-send must only fire when we can POSITIVELY confirm no receipt was
// recorded, so a missing audit table (pre-migration) leaves behaviour unchanged rather than
// re-sending every order's receipt.

import { supabaseAdmin, supabaseAnon } from "./supabase.js";
import { createLog } from "./logger.js";
import { sendOrderConfirmation, type OrderConfirmationPayload } from "./orderEmail.js";
import { resolveRecipientEmail } from "./recipientEmail.js";
import { publicSiteUrl } from "./siteUrl.js";

const db = () => supabaseAdmin ?? supabaseAnon;

interface ReceiptItemRow {
  sku: string;
  title: string;
  image_url: string | null;
  size: string | null;
  color_name: string | null;
  unit_price: number | string;
  line_total: number | string;
  quantity: number;
}

interface ReceiptOrderRow {
  id: string;
  user_id: string;
  order_number: string;
  subtotal: number | string;
  discount: number | string;
  shipping_fee: number | string;
  total: number | string;
  item_count: number;
  payment_method: string;
  status: string;
  created_at: string;
  shipping_address: Record<string, unknown> | null;
  order_items?: ReceiptItemRow[];
}

/**
 * Send the order-confirmation receipt for an already-placed order, but ONLY if one was never
 * recorded. Best-effort; never throws. Designed to be fire-and-forget (`void`) from the
 * webhook / verify idempotent-return paths so the receipt isn't lost when afterPlacement
 * didn't run to completion. A no-op when a receipt is already on record (the happy path).
 */
export async function sendReceiptIfMissing(orderId: string): Promise<void> {
  const log = createLog().start("RECEIPT BACKSTOP");
  try {
    // Already recorded? Then afterPlacement (or a prior backstop) sent it — skip to avoid a
    // duplicate. Fail CLOSED: only proceed on a definitive zero, so a guard read error (e.g.
    // the audit table is absent pre-migration) leaves behaviour unchanged instead of
    // re-sending every receipt.
    const { count, error: guardErr } = await db()
      .from("order_notifications")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("kind", "receipt");
    if (guardErr) {
      log.warn(`guard read failed — not auto-sending (fail closed): ${guardErr.message}`).end("RECEIPT BACKSTOP");
      return;
    }
    if ((count ?? 0) > 0) {
      log.step(`receipt already recorded for order=${orderId} — nothing to do`).end("RECEIPT BACKSTOP");
      return;
    }

    // No receipt on record — rebuild the SAME itemized payload from the persisted order
    // (mirrors the admin "Resend receipt" path) and send it.
    const { data, error } = await db()
      .from("orders")
      .select(`
        id, user_id, order_number, subtotal, discount, shipping_fee, total, item_count,
        payment_method, status, created_at, shipping_address,
        order_items(sku, title, image_url, size, color_name, unit_price, line_total, quantity)
      `)
      .eq("id", orderId)
      .maybeSingle();
    if (error || !data) {
      log.warn(`order load failed (order=${orderId}): ${error?.message ?? "not found"}`).end("RECEIPT BACKSTOP");
      return;
    }

    const row = data as unknown as ReceiptOrderRow;
    const { data: prof } = await db()
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", row.user_id)
      .maybeSingle();
    const recipientName = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() || undefined;
    // Fall back to the auth email when the profile has none (same as afterPlacement).
    const recipientEmail = await resolveRecipientEmail(row.user_id, (prof?.email as string) ?? "", log);
    const a = (row.shipping_address ?? {}) as Record<string, unknown>;

    const payload: OrderConfirmationPayload = {
      orderId: row.id,
      orderNumber: row.order_number,
      recipientEmail,
      recipientName,
      items: (row.order_items ?? []).map((it) => ({
        title: it.title,
        sku: it.sku,
        size: it.size || undefined,
        colorName: it.color_name || undefined,
        quantity: it.quantity,
        unitPrice: Number(it.unit_price) || 0,
        lineTotal: Number(it.line_total) || 0,
        imageUrl: it.image_url || undefined,
      })),
      subtotal: Number(row.subtotal) || 0,
      discount: Number(row.discount) || 0,
      shippingFee: Number(row.shipping_fee) || 0,
      total: Number(row.total) || 0,
      itemCount: row.item_count,
      paymentMethod: row.payment_method,
      orderUrl: `${publicSiteUrl()}/orders/${row.id}`,
      // Real order date (not "now") so a backstopped receipt still shows when it was placed.
      placedAt: row.created_at,
      address: {
        label: (a.label as string) ?? null,
        line1: (a.line1 as string) ?? "",
        line2: (a.line2 as string) || undefined,
        landmark: (a.landmark as string) ?? null,
        city: (a.city as string) ?? "",
        state: (a.state as string) ?? "",
        country: (a.country as string) ?? "",
        pincode: (a.pincode as string) ?? "",
      },
    };

    log.step(`no receipt on record for order=${row.order_number} — sending to "${recipientEmail || "<no email on file>"}"`);
    const mail = await sendOrderConfirmation(payload);

    // Record the send (kind='receipt') so a later webhook retry / the admin view sees it and
    // won't duplicate. Best-effort: a lost record just risks a later (benign) re-send.
    if (mail.sent) {
      const { error: recErr } = await db().from("order_notifications").insert({
        order_id: row.id,
        status: row.status,
        kind: "receipt",
        recipient_email: recipientEmail,
        sent_by: null,
        sent_by_name: "System",
      });
      if (recErr) log.warn(`could not record receipt notification: ${recErr.message}`);
    } else {
      log.warn(`send not completed (reason=${mail.reason ?? "?"}) — leaving unrecorded for a later retry`);
    }

    log.success(`done  order=${row.order_number}  emailed=${mail.sent}`).end("RECEIPT BACKSTOP");
  } catch (e) {
    log.warn(`threw (non-fatal): ${e instanceof Error ? e.message : String(e)}`).end("RECEIPT BACKSTOP");
  }
}
