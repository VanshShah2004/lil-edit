// Auto-processing status email.
//
// The confirmed → processing transition happens entirely inside Postgres
// (auto_confirm_to_processing(), scheduled by pg_cron on Pro+ or called via
// POST /api/admin/orders/auto-process on free tier). That path never touches the Node
// mailer — so until now the customer was never told their order moved to processing.
// This closes that gap: a Node sweep finds the orders the SYSTEM auto-transitioned and
// sends the SAME status-change notice the admin "Notify customer" path sends, exactly
// once, guarded by an order_notifications audit row (kind='status', status='processing').
//
// It's decoupled from HOW the transition happened — it keys off the system-authored
// confirmed→processing row in order_status_history (changed_by IS NULL, name 'System',
// written by admin_set_order_status), so it recovers the notice whether the transition
// came from pg_cron or the /auto-process endpoint.
//
// Never throws (best-effort, same posture as the receipt sweep). Fails CLOSED on a guard
// read error: an AUTOMATIC send only fires when we can POSITIVELY confirm no processing
// notice was recorded, so a missing table (pre-migration) leaves behaviour unchanged
// rather than blasting every order.

import { supabaseAdmin, supabaseAnon } from "./supabase.js";
import { createLog } from "./logger.js";
import { sendOrderStatusEmail } from "./orderEmail.js";
import { resolveRecipientEmail } from "./recipientEmail.js";
import { publicSiteUrl } from "./siteUrl.js";

const db = () => supabaseAdmin ?? supabaseAnon;

// A "processing" notice is time-sensitive, so this window is deliberately much tighter
// than the receipt sweep's 48h — it also stops a first deploy from emailing a historical
// backlog. The transition itself lands ~10-15 min after placement; anything older than
// this either was already notified or is stale.
const NOTIFY_LOOKBACK_MS = 6 * 60 * 60 * 1000; // 6 h
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;        // every 5 min — matches the transition cadence
const SWEEP_MAX_PER_CYCLE = 20;

let sweeper: ReturnType<typeof setInterval> | null = null;

interface OrderRow {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
}

/**
 * Email the customer that their order is now "processing", but ONLY if the system
 * auto-transitioned it and no processing notice was ever recorded. Best-effort; never
 * throws. A no-op when a processing notification already exists (the dedup guard) or the
 * order has since advanced past processing.
 */
export async function notifyProcessingIfNeeded(orderId: string): Promise<void> {
  const log = createLog().start("AUTO-PROCESS NOTIFY");
  try {
    // Already notified about processing? Skip. Fail CLOSED: only proceed on a definitive
    // zero, so a guard read error (audit table absent pre-migration) can't re-blast.
    const { count, error: guardErr } = await db()
      .from("order_notifications")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("kind", "status")
      .eq("status", "processing");
    if (guardErr) {
      log.warn(`guard read failed — not sending (fail closed): ${guardErr.message}`).end("AUTO-PROCESS NOTIFY");
      return;
    }
    if ((count ?? 0) > 0) {
      log.step(`processing notice already recorded for order=${orderId} — nothing to do`).end("AUTO-PROCESS NOTIFY");
      return;
    }

    // Confirm this order was SYSTEM-auto-transitioned to processing — not a manual admin
    // change where the admin deliberately left "Notify customer" unticked.
    const { data: hist, error: histErr } = await db()
      .from("order_status_history")
      .select("id")
      .eq("order_id", orderId)
      .eq("to_status", "processing")
      .eq("from_status", "confirmed")
      .is("changed_by", null)
      .eq("changed_by_name", "System")
      .limit(1);
    if (histErr) {
      log.warn(`history read failed — not sending (fail closed): ${histErr.message}`).end("AUTO-PROCESS NOTIFY");
      return;
    }
    if (!hist || hist.length === 0) {
      log.step(`order=${orderId} was not system-auto-transitioned — skipping`).end("AUTO-PROCESS NOTIFY");
      return;
    }

    // Load the order; only email if it's STILL processing, so an order an admin has since
    // advanced to shipped/delivered doesn't get a stale "now processing" notice.
    const { data, error } = await db()
      .from("orders")
      .select("id, user_id, order_number, status")
      .eq("id", orderId)
      .maybeSingle();
    if (error || !data) {
      log.warn(`order load failed (order=${orderId}): ${error?.message ?? "not found"}`).end("AUTO-PROCESS NOTIFY");
      return;
    }
    const row = data as unknown as OrderRow;
    if (row.status !== "processing") {
      log.step(`order=${row.order_number} is now "${row.status}", not processing — skipping stale notice`).end("AUTO-PROCESS NOTIFY");
      return;
    }

    const { data: prof } = await db()
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", row.user_id)
      .maybeSingle();
    const recipientName = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() || undefined;
    // Fall back to the auth email when the profile has none (same as the receipt path).
    const recipientEmail = await resolveRecipientEmail(row.user_id, (prof?.email as string) ?? "", log);

    log.step(`sending "processing" notice for order=${row.order_number} to "${recipientEmail || "<no email on file>"}"`);
    const mail = await sendOrderStatusEmail({
      recipientEmail,
      recipientName,
      orderNumber: row.order_number,
      toStatus: "processing",
      orderUrl: `${publicSiteUrl()}/orders/${row.id}`,
    });

    // Record the send (kind='status', status='processing') so a later sweep / retry sees
    // it and won't duplicate. Best-effort: a lost record just risks a later (benign)
    // re-send. Only record on a confirmed send so a failed one is retried next cycle.
    if (mail.sent) {
      const { error: recErr } = await db().from("order_notifications").insert({
        order_id: row.id,
        status: "processing",
        kind: "status",
        recipient_email: recipientEmail,
        sent_by: null,
        sent_by_name: "System",
      });
      if (recErr) log.warn(`could not record processing notification: ${recErr.message}`);
    } else {
      log.warn(`send not completed (reason=${mail.reason ?? "?"}) — leaving unrecorded for a later retry`);
    }

    log.success(`done  order=${row.order_number}  emailed=${mail.sent}`).end("AUTO-PROCESS NOTIFY");
  } catch (e) {
    log.warn(`threw (non-fatal): ${e instanceof Error ? e.message : String(e)}`).end("AUTO-PROCESS NOTIFY");
  }
}

/** One sweep pass. Exported (also called from the /auto-process endpoint); never throws. */
export async function sweepAutoProcessedNotifications(): Promise<void> {
  const log = createLog().start("AUTO-PROCESS NOTIFY SWEEP");
  try {
    const sinceIso = new Date(Date.now() - NOTIFY_LOOKBACK_MS).toISOString();
    // System-authored confirmed→processing transitions in the recent window.
    const { data: hist, error: histErr } = await db()
      .from("order_status_history")
      .select("order_id")
      .eq("to_status", "processing")
      .eq("from_status", "confirmed")
      .is("changed_by", null)
      .eq("changed_by_name", "System")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true });
    if (histErr) {
      log.warn(`history query failed — skipping cycle (fail closed): ${histErr.message}`).end("AUTO-PROCESS NOTIFY SWEEP");
      return;
    }
    const orderIds = Array.from(new Set(((hist ?? []) as Array<{ order_id: string }>).map((h) => h.order_id)));
    if (orderIds.length === 0) {
      log.step("no recent auto-transitions — nothing to do").end("AUTO-PROCESS NOTIFY SWEEP");
      return;
    }

    // Which already have a processing notice? Diff in-app (PostgREST has no anti-join).
    // Fail closed: a read error skips the cycle rather than treating all as un-notified.
    const { data: recs, error: recErr } = await db()
      .from("order_notifications")
      .select("order_id")
      .eq("kind", "status")
      .eq("status", "processing")
      .in("order_id", orderIds);
    if (recErr) {
      log.warn(`notifications query failed — skipping cycle (fail closed): ${recErr.message}`).end("AUTO-PROCESS NOTIFY SWEEP");
      return;
    }
    const notified = new Set(((recs ?? []) as Array<{ order_id: string }>).map((r) => r.order_id));
    const pending = orderIds.filter((id) => !notified.has(id)).slice(0, SWEEP_MAX_PER_CYCLE);

    if (pending.length === 0) {
      log.success(`all ${orderIds.length} recent auto-transition(s) already notified`).end("AUTO-PROCESS NOTIFY SWEEP");
      return;
    }

    log.step(`${pending.length} order(s) need a processing notice`);
    for (const id of pending) {
      // Sequential on purpose; notifyProcessingIfNeeded re-checks its own guard, never throws.
      await notifyProcessingIfNeeded(id);
    }
    log.success(`swept ${pending.length} order(s)`).end("AUTO-PROCESS NOTIFY SWEEP");
  } catch (e) {
    log.warn(`threw (non-fatal): ${e instanceof Error ? e.message : String(e)}`).end("AUTO-PROCESS NOTIFY SWEEP");
  }
}

/** Start the periodic sweep (call once at boot). Runs a first pass shortly after start. */
export function startAutoProcessNotifySweep(): void {
  if (sweeper) return;
  // First pass after a short delay, staggered behind the receipt sweep's 30s.
  setTimeout(() => void sweepAutoProcessedNotifications(), 45_000);
  sweeper = setInterval(() => void sweepAutoProcessedNotifications(), SWEEP_INTERVAL_MS);
  console.log(`[auto-process-notify] scheduled every ${SWEEP_INTERVAL_MS / 60000} min (lookback ${NOTIFY_LOOKBACK_MS / 3600000} h)`);
}
