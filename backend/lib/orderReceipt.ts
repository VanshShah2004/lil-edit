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
  coupon_code: string | null;
  shipping_fee: number | string;
  gift_wrap_fee: number | string | null;
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
        id, user_id, order_number, subtotal, discount, coupon_code, shipping_fee, gift_wrap_fee, total, item_count,
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
      couponCode: row.coupon_code || undefined,
      shippingFee: Number(row.shipping_fee) || 0,
      giftWrapFee: Number(row.gift_wrap_fee) || 0,
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

// ─── Scheduled receipt sweep ─────────────────────────────────────────────────────
// The webhook/verify backstop above only fires when Razorpay retries — if the webhook
// isn't configured (or the retry window is exhausted), a receipt lost at placement stays
// lost until an admin notices. This sweep closes that: every SWEEP_INTERVAL_MS it looks
// for recently PAID orders with no kind='receipt' row and runs sendReceiptIfMissing on
// each, making receipt recovery self-healing with no external trigger.
//
// Guard rails (all deliberate):
//   • Only orders older than SWEEP_MIN_AGE_MS — afterPlacement's detached send has long
//     finished by then, so the sweep can't race it into a duplicate (this window is wider
//     than the webhook backstop's, eliminating that residual for the sweep path).
//   • Only orders from the last SWEEP_LOOKBACK_MS — bounded query, and no surprise
//     receipt blasts for historical orders the day the migration lands.
//   • Fail CLOSED on either query error (e.g. order_notifications missing pre-migration):
//     skip the cycle entirely. sendReceiptIfMissing re-checks per order anyway.
//   • Capped at SWEEP_MAX_PER_CYCLE sends per cycle; sequential so an SMTP stall can't
//     fan out. If the mailer is unconfigured the sends no-op and stay unrecorded — the
//     sweep just logs and retries next cycle, which is exactly the desired behaviour
//     (the receipts go out on their own once GMAIL_APP_PASSWORD lands).

const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // every 10 min
const SWEEP_MIN_AGE_MS = 10 * 60 * 1000;  // leave fresh orders to afterPlacement
const SWEEP_LOOKBACK_MS = 48 * 60 * 60 * 1000; // 48 h
const SWEEP_MAX_PER_CYCLE = 20;

let sweeper: ReturnType<typeof setInterval> | null = null;

/** One sweep pass. Exported for testing; never throws. */
export async function sweepMissingReceipts(): Promise<void> {
  const log = createLog().start("RECEIPT SWEEP");
  try {
    const now = Date.now();
    const { data: orders, error: ordErr } = await db()
      .from("orders")
      .select("id, order_number")
      .eq("payment_status", "paid")
      .gte("created_at", new Date(now - SWEEP_LOOKBACK_MS).toISOString())
      .lte("created_at", new Date(now - SWEEP_MIN_AGE_MS).toISOString())
      .order("created_at", { ascending: true });
    if (ordErr) {
      log.warn(`orders query failed — skipping cycle: ${ordErr.message}`).end("RECEIPT SWEEP");
      return;
    }
    const candidates = (orders ?? []) as Array<{ id: string; order_number: string }>;
    if (candidates.length === 0) {
      log.step("no paid orders in window — nothing to do").end("RECEIPT SWEEP");
      return;
    }

    // One query for all receipt rows in the window, then diff in-app (PostgREST has no
    // anti-join). Fail closed: a read error here (table missing pre-migration) skips the
    // cycle rather than treating every order as unreceipted.
    const { data: recs, error: recErr } = await db()
      .from("order_notifications")
      .select("order_id")
      .eq("kind", "receipt")
      .in("order_id", candidates.map((o) => o.id));
    if (recErr) {
      log.warn(`receipt-rows query failed — skipping cycle (fail closed): ${recErr.message}`).end("RECEIPT SWEEP");
      return;
    }
    const receipted = new Set(((recs ?? []) as Array<{ order_id: string }>).map((r) => r.order_id));
    const missing = candidates.filter((o) => !receipted.has(o.id)).slice(0, SWEEP_MAX_PER_CYCLE);

    if (missing.length === 0) {
      log.success(`all ${candidates.length} paid order(s) in window have receipts`).end("RECEIPT SWEEP");
      return;
    }

    log.step(`${missing.length} order(s) missing a receipt: ${missing.map((o) => o.order_number).join(", ")}`);
    for (const o of missing) {
      // Sequential on purpose; sendReceiptIfMissing re-checks the guard row itself and
      // never throws.
      await sendReceiptIfMissing(o.id);
    }
    log.success(`swept ${missing.length} order(s)`).end("RECEIPT SWEEP");
  } catch (e) {
    log.warn(`threw (non-fatal): ${e instanceof Error ? e.message : String(e)}`).end("RECEIPT SWEEP");
  }
}

/** Start the periodic sweep (call once at boot). Runs a first pass shortly after start. */
export function startReceiptSweep(): void {
  if (sweeper) return;
  // First pass after a short delay so boot-time warmups aren't competing with it.
  setTimeout(() => void sweepMissingReceipts(), 30_000);
  sweeper = setInterval(() => void sweepMissingReceipts(), SWEEP_INTERVAL_MS);
  console.log(`[receipt-sweep] scheduled every ${SWEEP_INTERVAL_MS / 60000} min (lookback ${SWEEP_LOOKBACK_MS / 3600000} h)`);
}
