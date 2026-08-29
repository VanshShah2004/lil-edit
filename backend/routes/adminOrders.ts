import { performance } from "perf_hooks";
import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminMutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, fms, type OpLogger } from "../lib/logger.js";
import { logAdminAction } from "../lib/adminAudit.js";
// redisDel/redisKey bust the OWNER's cached order list + detail on a status change.
import { redisDel, redisKey } from "../lib/redis.js";
// Customer-facing emails (no-op if Gmail SMTP isn't configured): the per-status change
// notification, and the order-confirmation receipt re-send.
import { sendOrderStatusEmail, sendOrderConfirmation, type OrderConfirmationPayload } from "../lib/orderEmail.js";
// Storefront base URL for the "View your order" link (shared with the confirmation email).
import { publicSiteUrl } from "../lib/siteUrl.js";
// Resolve a customer's email (profiles.email, else the auth identity) so a missing profile
// email can't silently drop a notification or receipt.
import { resolveRecipientEmail } from "../lib/recipientEmail.js";
// After the auto-transition moves orders confirmed→processing, email the affected
// customers the "now processing" notice (the DB-side transition can't reach the mailer).
import { sweepAutoProcessedNotifications } from "../lib/processingNotify.js";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;

// Mirror the DB CHECK constraint on orders.status.
const VALID_STATUSES = ["confirmed", "processing", "shipped", "delivered", "cancelled"] as const;
type OrderStatus = (typeof VALID_STATUSES)[number];

// Mirror the DB CHECK constraint on orders.payment_status.
const VALID_PAYMENT_STATUSES = ["pending", "paid", "refunded"] as const;
type PaymentStatus = (typeof VALID_PAYMENT_STATUSES)[number];

// Every admin endpoint requires a valid token AND an admin role. requireAuth sets
// req.userId; requireAdmin reads it and checks profiles.role server-side.
router.use(requireAuth, requireAdmin);

// Columns selected for both list and detail (detail adds shipping_address + transaction_id).
const ORDER_ITEMS_SELECT = `
  id, product_id, product_slug, category_slug, sku, title, image_url,
  size, color_name, color_hex, unit_price, original_price, quantity, line_total
`.trim();

interface OrderItemRow {
  id: string;
  product_id: string | null;
  product_slug: string;
  category_slug: string | null;
  sku: string;
  title: string;
  image_url: string | null;
  size: string | null;
  color_name: string | null;
  color_hex: string | null;
  unit_price: number | string;
  original_price: number | string | null;
  quantity: number;
  line_total: number | string;
}

interface OrderRow {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number | string;
  discount: number | string;
  coupon_code?: string | null;
  shipping_fee: number | string;
  gift_wrap_fee: number | string | null;
  tax: number | string | null;
  total: number | string;
  item_count: number;
  created_at: string;
  transaction_id?: string | null;
  shipping_address?: Record<string, unknown> | null;
  order_items?: OrderItemRow[];
  order_status_history?: StatusHistoryRow[];
  payment_status_history?: StatusHistoryRow[];
}

interface ProfileRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
}

interface StatusHistoryRow {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_by_email: string | null;
  note: string | null;
  // Only present on order_status_history (not payment_status_history) — marks a row
  // written via the terminal-state override. Undefined for payment rows → false.
  is_correction?: boolean;
  created_at: string;
}

function mapItem(row: OrderItemRow) {
  return {
    id: row.id,
    productId: row.product_id ?? null,
    productSlug: row.product_slug,
    categorySlug: row.category_slug ?? "",
    sku: row.sku,
    title: row.title,
    image: row.image_url ?? "",
    size: row.size ?? "",
    color: { name: row.color_name ?? "", hex: row.color_hex ?? "#cccccc" },
    unitPrice: Number(row.unit_price) || 0,
    originalPrice: Number(row.original_price) || Number(row.unit_price) || 0,
    quantity: row.quantity,
    lineTotal: Number(row.line_total) || 0,
  };
}

function mapHistory(row: StatusHistoryRow) {
  return {
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    changedByName: row.changed_by_name || "",
    changedByEmail: row.changed_by_email || "",
    note: row.note ?? null,
    isCorrection: row.is_correction ?? false,
    createdAt: row.created_at,
  };
}

function customerOf(userId: string, profile: ProfileRow | undefined) {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return {
    userId,
    name: name || "—",
    email: profile?.email ?? "",
    phone: profile?.phone_number ?? "",
  };
}

function mapOrder(row: OrderRow, profile: ProfileRow | undefined, includeDetail: boolean) {
  const base = {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    subtotal: Number(row.subtotal) || 0,
    discount: Number(row.discount) || 0,
    shippingFee: Number(row.shipping_fee) || 0,
    giftWrapFee: Number(row.gift_wrap_fee) || 0,
    tax: Number(row.tax) || 0,
    total: Number(row.total) || 0,
    itemCount: row.item_count,
    createdAt: row.created_at,
    customer: customerOf(row.user_id, profile),
    items: (row.order_items ?? []).map(mapItem),
  };
  if (!includeDetail) return base;
  return {
    ...base,
    transactionId: row.transaction_id ?? null,
    shippingAddress: row.shipping_address ?? {},
    // Newest change first — the timeline reads top-down from the latest action.
    statusHistory: (row.order_status_history ?? [])
      .map(mapHistory)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    // Same shape/ordering as statusHistory — the payment audit trail.
    paymentStatusHistory: (row.payment_status_history ?? [])
      .map(mapHistory)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}

// Fetch the profile rows for a set of user ids, returned as an id→row map. Done as
// a separate query because orders.user_id → auth.users and profiles.id → auth.users
// are sibling FKs (no direct orders↔profiles relationship for PostgREST to embed).
async function loadProfiles(userIds: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return map;
  const { data } = await db()
    .from("profiles")
    .select("id, email, first_name, last_name, phone_number")
    .in("id", unique);
  for (const p of (data ?? []) as ProfileRow[]) map.set(p.id, p);
  return map;
}

// A notification row to write BEFORE the email goes out. Every sender (the status PATCH
// and the interactive resend endpoints) "claims" the row first so that a record lost AFTER a successful send can never blind the
// dedup guard (notificationExists) into allowing a duplicate later. Returns the new row id
// (so a failed send can release it). `degraded` = the audit table is absent (pre-migration) —
// the guard is moot then anyway, so callers send without tracking. id=null & !degraded = a
// real write error: the interactive endpoints fail CLOSED (refuse + ask to retry) rather than
// send something the guard won't see.
interface ClaimResult {
  id: string | null;
  degraded: boolean;
}

function isMissingTableError(code?: string, message?: string): boolean {
  return (
    code === "42P01" ||            // Postgres: undefined_table
    code === "PGRST205" ||          // PostgREST: table not in schema cache
    /does not exist|find the table/i.test(message ?? "")
  );
}

async function claimNotification(
  orderId: string,
  status: string,
  recipientEmail: string,
  adminId: string | null,
  adminName: string,
  kind: "status" | "receipt",
  log: OpLogger,
): Promise<ClaimResult> {
  try {
    const { data, error } = await db()
      .from("order_notifications")
      .insert({
        order_id: orderId,
        status,
        kind,
        recipient_email: recipientEmail,
        sent_by: adminId,
        sent_by_name: adminName,
      })
      .select("id")
      .single();
    if (error) {
      const missing = isMissingTableError((error as { code?: string }).code, error.message);
      log.warn(`claim notification ${missing ? "skipped (table missing)" : "FAILED"}: ${error.message}`);
      return { id: null, degraded: missing };
    }
    return { id: (data as { id: string }).id, degraded: false };
  } catch (e) {
    log.warn(`claim notification threw: ${e instanceof Error ? e.message : String(e)}`);
    return { id: null, degraded: false };
  }
}

// Undo a claim when the send didn't go out, so the slot is free for a retry. Best-effort: a
// lost delete just leaves the row, which guards the next attempt behind the admin's "Send
// again" confirm — a recoverable over-block, never a silent duplicate.
async function releaseNotification(id: string, log: OpLogger): Promise<void> {
  try {
    const { error } = await db().from("order_notifications").delete().eq("id", id);
    if (error) log.warn(`release notification failed (id=${id}): ${error.message}`);
  } catch (e) {
    log.warn(`release notification threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Has a customer notification of this kind already been recorded for this order? Powers the
// SERVER-SIDE duplicate guard (so the UI warning is no longer the only gate): a repeat send
// is allowed only when the admin explicitly confirms, so a double-click, a second admin, or a
// raw API call can't silently send the same email twice.
//   • kind='status'  → match the SAME status (re-notifying a *different* status is fine)
//   • kind='receipt' → pass status=null to match any receipt row (the receipt is one
//     status-independent document)
// Fails OPEN: on a read error (e.g. the table is missing pre-migration) it returns false so a
// legitimate send is never blocked — the worst case is the prior advisory-only behaviour.
async function notificationExists(
  orderId: string,
  status: string | null,
  kind: "status" | "receipt",
  log: OpLogger,
): Promise<boolean> {
  try {
    let q = db()
      .from("order_notifications")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("kind", kind);
    if (status !== null) q = q.eq("status", status);
    const { count, error } = await q;
    if (error) {
      log.warn(`duplicate-send check failed (table missing?): ${error.message}`);
      return false;
    }
    return (count ?? 0) > 0;
  } catch (e) {
    log.warn(`duplicate-send check threw: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

// PostgREST .or() takes a comma/parenthesis-delimited filter string, so a raw
// search term containing those characters would corrupt the filter. Strip them.
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*]/g, " ").trim();
}

// ─── GET /api/admin/orders — paginated list with search / filter / sort ──────────
router.get("/", async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN ORDERS LIST");
  const adminId = (req as AuthenticatedRequest).userId;

  const search = sanitizeSearch((req.query.search as string) ?? "");
  const status = ((req.query.status as string) ?? "all").toLowerCase();
  const paymentStatus = ((req.query.paymentStatus as string) ?? "all").toLowerCase();
  const sort = ((req.query.sort as string) ?? "newest").toLowerCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  log.step(`admin=${adminId}  search="${search}"  status=${status}  pay=${paymentStatus}  sort=${sort}  page=${page}  limit=${limit}`);

  try {
    // Resolve customer matches first (name/email live in profiles, not orders).
    let matchedUserIds: string[] = [];
    if (search) {
      const { data: profs } = await db()
        .from("profiles")
        .select("id")
        .or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
      matchedUserIds = (profs ?? []).map((p) => (p as { id: string }).id);
      log.step(`search → ${matchedUserIds.length} matching customer(s)`);
    }

    const t0 = performance.now();
    let query = db()
      .from("orders")
      .select(
        `
        id, user_id, order_number, status, payment_method, payment_status,
        subtotal, discount, shipping_fee, gift_wrap_fee, tax, total, item_count, created_at,
        order_items(${ORDER_ITEMS_SELECT})
      `,
        { count: "exact" },
      );

    if (status !== "all") query = query.eq("status", status);
    if (paymentStatus !== "all") query = query.eq("payment_status", paymentStatus);

    if (search) {
      const ors = [`order_number.ilike.%${search}%`];
      if (matchedUserIds.length) ors.push(`user_id.in.(${matchedUserIds.join(",")})`);
      query = query.or(ors.join(","));
    }

    // Sort.
    switch (sort) {
      case "oldest":  query = query.order("created_at", { ascending: true }); break;
      case "highest": query = query.order("total", { ascending: false }); break;
      case "lowest":  query = query.order("total", { ascending: true }); break;
      case "newest":
      default:        query = query.order("created_at", { ascending: false }); break;
    }

    // Pagination.
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    log.step(`DB orders: ${fms(performance.now() - t0)}  rows=${data?.length ?? 0}  total=${count ?? 0}`);

    if (error) {
      log.error(`orders query failed  code=${error.code}  msg=${error.message}`, error).end("ADMIN ORDERS LIST");
      res.status(500).json({ error: error.message });
      return;
    }

    const rows = (data ?? []) as unknown as OrderRow[];
    const profiles = await loadProfiles(rows.map((r) => r.user_id));
    const orders = rows.map((r) => mapOrder(r, profiles.get(r.user_id), false));
    const total = count ?? orders.length;

    log.success(`served  orders=${orders.length}/${total}  total=${fms(log.elapsed())}`).end("ADMIN ORDERS LIST");
    res.json({ orders, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ORDERS LIST");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── GET /api/admin/orders/:id — full order detail (any owner) ───────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN ORDER DETAIL");
  const orderId = req.params.id as string;
  log.step(`order=${orderId}`);

  try {
    const t0 = performance.now();
    // Admin can read ANY order — scoped only by id (not user_id, unlike the
    // customer route).
    const { data, error } = await db()
      .from("orders")
      .select(
        `
        id, user_id, order_number, status, payment_method, payment_status,
        subtotal, discount, shipping_fee, gift_wrap_fee, tax, total, item_count, created_at,
        transaction_id, shipping_address,
        order_items(${ORDER_ITEMS_SELECT}),
        order_status_history(
          id, from_status, to_status, changed_by, changed_by_name, changed_by_email, note, is_correction, created_at
        ),
        payment_status_history(
          id, from_status, to_status, changed_by, changed_by_name, changed_by_email, note, is_correction, created_at
        )
      `,
      )
      .eq("id", orderId)
      .maybeSingle();
    log.step(`DB order: ${fms(performance.now() - t0)}  found=${!!data}`);

    if (error) {
      log.error(`order query failed  code=${error.code}  msg=${error.message}`, error).end("ADMIN ORDER DETAIL");
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      log.warn(`not found  order=${orderId}`).end("ADMIN ORDER DETAIL");
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const row = data as unknown as OrderRow;
    // Profiles + notification audit, fetched in parallel. The notifications query is
    // deliberately tolerant of the table not existing yet (pre-migration): on error it
    // yields [], so the detail page still loads — just without the "already notified"
    // markers in the Status History timeline.
    const [profiles, notifs] = await Promise.all([
      loadProfiles([row.user_id]),
      db().from("order_notifications").select("status, kind").eq("order_id", orderId),
    ]);
    if (notifs.error) log.warn(`notifications query failed (table missing?): ${notifs.error.message}`);
    const notifRows = (notifs.data ?? []) as { status: string; kind?: string | null }[];
    // Distinct statuses the customer has been emailed about — STATUS notifications only
    // (the receipt is a separate kind, so it never pollutes the "already notified" guard).
    // Rows predating the `kind` column read as 'status' via the column default.
    const notifiedStatuses = [
      ...new Set(notifRows.filter((n) => (n.kind ?? "status") !== "receipt").map((n) => n.status)),
    ];
    // Whether the order-confirmation receipt has a recorded send (drives the receipt
    // indicator + "Resend receipt" affordance).
    const receiptSent = notifRows.some((n) => n.kind === "receipt");
    const order = mapOrder(row, profiles.get(row.user_id), true);

    log.success(`served  order=${order.orderNumber}  items=${order.items.length}  notified=[${notifiedStatuses.join(",")}]  receipt=${receiptSent}  total=${fms(log.elapsed())}`).end("ADMIN ORDER DETAIL");
    res.json({ order: { ...order, notifiedStatuses, receiptSent } });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ORDER DETAIL");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── PATCH /api/admin/orders/:id/status — update order status ─────────────────────
router.patch("/:id/status", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN ORDER STATUS");
  const adminId = (req as AuthenticatedRequest).userId;
  const orderId = req.params.id as string;
  const status = String((req.body as { status?: unknown })?.status ?? "").toLowerCase() as OrderStatus;
  // Optional admin note/reminder attached to this change. Trim + cap so a stray
  // huge payload can't bloat the audit row; empty becomes null.
  const rawNote = String((req.body as { note?: unknown })?.note ?? "").trim();
  const note = rawNote ? rawNote.slice(0, 500) : null;
  // Override = a deliberate correction of a finalized (terminal) order. It bypasses the
  // forward-only transition machine, so it's gated: a note is mandatory and the change
  // is flagged as a correction in the audit trail.
  const override = (req.body as { override?: unknown })?.override === true;
  // Optimistic concurrency guard: the client sends the status it *read* before deciding
  // to write. The RPC checks it under the row lock — mismatch → 'conflict' → 409.
  const expectedStatus = (req.body as { expectedStatus?: unknown })?.expectedStatus as string | null ?? null;
  // When true (admin ticked "Notify customer via Gmail"), email the order owner about
  // the new status after a successful change. Best-effort: never fails the update.
  const notify = (req.body as { notify?: unknown })?.notify === true;
  log.step(`admin=${adminId}  order=${orderId}  → status=${status}  override=${override}  expected=${expectedStatus ?? "any"}  notify=${notify}  note=${note ? `"${note.slice(0, 40)}…"` : "none"}`);

  if (!VALID_STATUSES.includes(status)) {
    log.warn(`invalid status="${status}"`).end("ADMIN ORDER STATUS");
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  try {
    // Snapshot the acting admin's identity into the audit row so the trail stays
    // readable even if this admin's profile is later changed or removed.
    const adminProfiles = await loadProfiles([adminId]);
    const admin = adminProfiles.get(adminId);
    const adminName = [admin?.first_name, admin?.last_name].filter(Boolean).join(" ").trim() || "Admin";
    const adminEmail = admin?.email ?? "";

    // Atomic: locks the order row, updates the status, and appends the audit entry
    // in a single transaction (admin_set_order_status). The audit trail can never
    // desync from the order's actual state, and concurrent edits serialize.
    const { data, error } = await db().rpc("admin_set_order_status", {
      p_order_id: orderId,
      p_status: status,
      p_admin_id: adminId,
      p_admin_name: adminName,
      p_admin_email: adminEmail,
      p_note: note,
      p_override: override,
      p_expected_status: expectedStatus,
    });

    if (error) {
      log.error(`update failed  code=${error.code}  msg=${error.message}`, error).end("ADMIN ORDER STATUS");
      res.status(500).json({ error: error.message });
      return;
    }

    // The function returns one row (or none for a missing order).
    const result = (Array.isArray(data) ? data[0] : data) as
      | { owner_id: string; from_status: string; result: "changed" | "unchanged" | "invalid" | "conflict" }
      | undefined;

    if (!result) {
      log.warn(`not found  order=${orderId}`).end("ADMIN ORDER STATUS");
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (result.result === "conflict") {
      log.warn(`stale edit  order=${orderId}  expected=${expectedStatus}  actual=${result.from_status}`).end("ADMIN ORDER STATUS");
      res.status(409).json({
        error: `Order was updated by another admin — current status is "${result.from_status}".`,
        currentStatus: result.from_status,
      });
      return;
    }

    if (result.result === "invalid") {
      log.warn(`illegal transition  order=${orderId}  ${result.from_status}→${status}`).end("ADMIN ORDER STATUS");
      res.status(400).json({ error: `Cannot change status from "${result.from_status}" to "${status}".` });
      return;
    }

    if (result.result === "unchanged") {
      log.success(`no change  order=${orderId}  already=${status}`).end("ADMIN ORDER STATUS");
      res.json({ success: true, unchanged: true });
      return;
    }

    // Bust the OWNER's cached order list + detail so the customer sees the new
    // status immediately (same keys orders.ts writes). The admin list/detail are
    // uncached and always read fresh.
    const ownerId = result.owner_id;
    await redisDel(
      log,
      redisKey("order", `list:${ownerId}`),
      redisKey("order", `detail:${ownerId}:${orderId}`),
    );

    // Notify the customer of the new status, if requested. Best-effort and awaited so
    // we can report back whether it went out — but wrapped so a mail failure never
    // turns a committed status change into an error response.
    let emailed = false;
    // Why the email didn't go out (if it didn't) — surfaced to the admin UI for a precise
    // message (no email on file vs. not configured vs. send failed).
    let emailReason: string | undefined;
    if (notify) {
      try {
        const [ownerProfiles, orderMeta] = await Promise.all([
          loadProfiles([ownerId]),
          db().from("orders").select("order_number").eq("id", orderId).maybeSingle(),
        ]);
        const owner = ownerProfiles.get(ownerId);
        const recipientName = [owner?.first_name, owner?.last_name].filter(Boolean).join(" ").trim();
        const orderNumber = (orderMeta.data as { order_number?: string } | null)?.order_number ?? orderId;
        const recipientEmail = await resolveRecipientEmail(ownerId, owner?.email, log);
        // Claim the notification row BEFORE sending (same posture as /notify and
        // /resend-receipt): if the send succeeded but a post-send record write were lost,
        // the dedup guard would go blind and a later resend could duplicate. A hard claim
        // failure (not a missing table) means we can't track the send — skip the email
        // rather than send one the guard won't see; the status change itself still commits.
        const claim = await claimNotification(orderId, status, recipientEmail, adminId, adminName, "status", log);
        if (!claim.id && !claim.degraded) {
          log.warn("could not record the notification — not sending to avoid an untracked duplicate");
          emailReason = "send_failed";
        } else {
          const mail = await sendOrderStatusEmail({
            recipientEmail,
            recipientName: recipientName || undefined,
            orderNumber,
            toStatus: status,
            orderUrl: `${publicSiteUrl()}/orders/${orderId}`,
          });
          emailed = mail.sent;
          emailReason = mail.reason;
          // Send failed → release the claim so the slot is free for a retry.
          if (!emailed) {
            if (claim.id) await releaseNotification(claim.id, log);
            log.warn(`notify requested but email not sent: ${mail.error ?? "unknown"} (reason=${mail.reason ?? "?"})`);
          }
        }
      } catch (mailErr) {
        log.error("status email failed", mailErr);
        emailReason = "send_failed";
      }
    }

    log.success(`updated  order=${orderId}  ${result.from_status}→${status}  by=${adminName}  owner=${ownerId}  emailed=${emailed}`).end("ADMIN ORDER STATUS");
    void logAdminAction({
      adminId,
      action: "order_status_changed",
      targetType: "order",
      targetId: orderId,
      summary: `Changed order status ${result.from_status} → ${status}`,
      metadata: { orderId, fromStatus: result.from_status, toStatus: status, override, note, emailed },
    });
    res.json({ success: true, emailed, ...(emailReason ? { reason: emailReason } : {}) });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ORDER STATUS");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/admin/orders/:id/notify — (re)send the current-status email ─────────
// The "Notify via Gmail" action in the Status History timeline. Unlike the status PATCH,
// this changes NOTHING about the order — it re-sends the customer notification for the
// order's CURRENT status, so a failed/again send is recoverable without bouncing the
// status. The UI guards against accidental duplicates (it warns when the status was
// already notified); this endpoint just sends and records the result.
router.post("/:id/notify", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN ORDER NOTIFY");
  const adminId = (req as AuthenticatedRequest).userId;
  const orderId = req.params.id as string;
  // Explicit override: the admin clicked "Send again" through the duplicate warning. Without
  // it, a repeat notification for a status already emailed is refused server-side (409).
  const confirm = (req.body as { confirm?: unknown })?.confirm === true;
  log.step(`admin=${adminId}  order=${orderId}  confirm=${confirm}  (resend current-status notification)`);

  try {
    const { data, error } = await db()
      .from("orders")
      .select("id, user_id, order_number, status")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      log.error(`order query failed  msg=${error.message}`, error).end("ADMIN ORDER NOTIFY");
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      log.warn(`not found  order=${orderId}`).end("ADMIN ORDER NOTIFY");
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const o = data as { id: string; user_id: string; order_number: string | null; status: string };

    // Server-side duplicate guard (option B): unless the admin explicitly confirmed, refuse a
    // second notification for a status the customer was already emailed about. Catches the
    // double-click / concurrent-admin / direct-API cases the UI's advisory warning can't see.
    // The client turns this 409 into the same "Send again" prompt, which retries with confirm.
    if (!confirm && (await notificationExists(orderId, o.status, "status", log))) {
      log.warn(`already notified status=${o.status} & confirm not set — refusing duplicate`).end("ADMIN ORDER NOTIFY");
      res.status(409).json({ alreadySent: true, status: o.status, error: `The customer was already notified that this order is "${o.status}".` });
      return;
    }

    const [ownerProfiles, adminProfiles] = await Promise.all([
      loadProfiles([o.user_id]),
      loadProfiles([adminId]),
    ]);
    const owner = ownerProfiles.get(o.user_id);
    const admin = adminProfiles.get(adminId);
    const adminName = [admin?.first_name, admin?.last_name].filter(Boolean).join(" ").trim() || "Admin";
    const recipientName = [owner?.first_name, owner?.last_name].filter(Boolean).join(" ").trim();
    const recipientEmail = await resolveRecipientEmail(o.user_id, owner?.email, log);

    // Claim the notification row BEFORE sending: if the send succeeds but a post-send record
    // write were lost, the dedup guard would go blind and a later resend could duplicate.
    // Recording first closes that. A hard write error (not a missing table) means we can't
    // safely track the send, so refuse and let the admin retry rather than risk a duplicate.
    const claim = await claimNotification(orderId, o.status, recipientEmail, adminId, adminName, "status", log);
    if (!claim.id && !claim.degraded) {
      log.error("could not record the notification — not sending to avoid an untracked duplicate").end("ADMIN ORDER NOTIFY");
      res.status(503).json({ error: "Couldn't send the notification right now — please try again.", reason: "send_failed" });
      return;
    }

    const mail = await sendOrderStatusEmail({
      recipientEmail,
      recipientName: recipientName || undefined,
      orderNumber: o.order_number ?? orderId,
      toStatus: o.status,
      orderUrl: `${publicSiteUrl()}/orders/${orderId}`,
    });

    // Send failed → release the claim so the slot is free for a retry.
    if (!mail.sent) {
      if (claim.id) await releaseNotification(claim.id, log);
      log.warn(`notify not sent: ${mail.error ?? "unknown"}`);
    }

    log.success(`notify  order=${orderId}  status=${o.status}  emailed=${mail.sent}${mail.reason ? `  reason=${mail.reason}` : ""}`).end("ADMIN ORDER NOTIFY");
    // Audit: this endpoint puts an email in a customer's inbox on an admin's say-so, and
    // (unlike the status PATCH) leaves no other trace of who triggered it. `confirm` marks a
    // deliberate resend past the duplicate guard, so repeated nudges are visible in the trail.
    void logAdminAction({
      adminId,
      action: "order_notification_sent",
      targetType: "order",
      targetId: orderId,
      summary: `Re-sent the "${o.status}" notification for order ${o.order_number ? `#${o.order_number}` : orderId}`,
      metadata: { orderId, orderNumber: o.order_number, status: o.status, resend: confirm, emailed: mail.sent, ...(mail.reason ? { reason: mail.reason } : {}) },
    });
    res.json({ emailed: mail.sent, status: o.status, ...(mail.reason ? { reason: mail.reason } : {}) });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ORDER NOTIFY");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/admin/orders/:id/resend-receipt — (re)send the confirmation receipt ─────
// The order-confirmation receipt is auto-sent fire-and-forget at placement; this is its
// recovery / send-again path (the receipt is a one-off document, so unlike the status
// notification it has no per-status "already notified" guard — sending again is always
// allowed). Rebuilds the SAME itemized payload from the persisted order + items + address
// and sends via the shared mailer, recording a kind='receipt' row on a confirmed send.
router.post("/:id/resend-receipt", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN ORDER RESEND RECEIPT");
  const adminId = (req as AuthenticatedRequest).userId;
  const orderId = req.params.id as string;
  // Explicit override: the admin clicked "Send again" through the duplicate warning. Without
  // it, a resend is refused server-side (409) when a receipt was already sent for this order.
  const confirm = (req.body as { confirm?: unknown })?.confirm === true;
  log.step(`admin=${adminId}  order=${orderId}  confirm=${confirm}  (resend confirmation receipt)`);

  try {
    const { data, error } = await db()
      .from("orders")
      .select(`
        id, user_id, order_number, subtotal, discount, coupon_code, shipping_fee, gift_wrap_fee, total, item_count,
        payment_method, status, created_at, shipping_address,
        order_items(${ORDER_ITEMS_SELECT})
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      log.error(`order query failed  msg=${error.message}`, error).end("ADMIN ORDER RESEND RECEIPT");
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      log.warn(`not found  order=${orderId}`).end("ADMIN ORDER RESEND RECEIPT");
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const row = data as unknown as OrderRow;

    // Server-side duplicate guard (option B): a receipt is one status-independent document, so
    // match any prior receipt row for this order. Unless the admin explicitly confirmed, refuse
    // the duplicate; the client turns this 409 into the "Send again" prompt (which retries with
    // confirm). Catches double-clicks / concurrent admins / direct API calls.
    if (!confirm && (await notificationExists(orderId, null, "receipt", log))) {
      log.warn(`receipt already sent & confirm not set — refusing duplicate`).end("ADMIN ORDER RESEND RECEIPT");
      res.status(409).json({ alreadySent: true, error: "A confirmation receipt has already been sent for this order." });
      return;
    }

    const [ownerProfiles, adminProfiles] = await Promise.all([
      loadProfiles([row.user_id]),
      loadProfiles([adminId]),
    ]);
    const owner = ownerProfiles.get(row.user_id);
    const admin = adminProfiles.get(adminId);
    const adminName = [admin?.first_name, admin?.last_name].filter(Boolean).join(" ").trim() || "Admin";
    const recipientName = [owner?.first_name, owner?.last_name].filter(Boolean).join(" ").trim() || undefined;
    const recipientEmail = await resolveRecipientEmail(row.user_id, owner?.email, log);
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
      // Real order date (not "now") so a later re-send still shows when it was placed.
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

    // Claim BEFORE sending (kind='receipt') so a lost post-send record can't blind the guard;
    // refuse on a hard write error rather than risk an untracked duplicate. status carries the
    // order's CURRENT status (informational — the receiptSent indicator keys on kind, not status).
    const claim = await claimNotification(orderId, row.status, recipientEmail, adminId, adminName, "receipt", log);
    if (!claim.id && !claim.degraded) {
      log.error("could not record the receipt — not sending to avoid an untracked duplicate").end("ADMIN ORDER RESEND RECEIPT");
      res.status(503).json({ error: "Couldn't send the receipt right now — please try again.", reason: "send_failed" });
      return;
    }

    const mail = await sendOrderConfirmation(payload);
    // Send failed → release the claim so the slot is free for a retry.
    if (!mail.sent) {
      if (claim.id) await releaseNotification(claim.id, log);
      log.warn(`receipt resend not sent: ${mail.error ?? "unknown"} (reason=${mail.reason ?? "?"})`);
    }

    log.success(`receipt resend  order=${orderId}  emailed=${mail.sent}${mail.reason ? `  reason=${mail.reason}` : ""}`).end("ADMIN ORDER RESEND RECEIPT");
    // Audit: same reasoning as /notify — an admin-triggered email to a customer, with the
    // full itemized receipt in it. Logged whether or not the mailer accepted it.
    void logAdminAction({
      adminId,
      action: "order_receipt_resent",
      targetType: "order",
      targetId: orderId,
      summary: `Re-sent the confirmation receipt for order ${row.order_number ? `#${row.order_number}` : orderId}`,
      metadata: { orderId, orderNumber: row.order_number, status: row.status, resend: confirm, emailed: mail.sent, ...(mail.reason ? { reason: mail.reason } : {}) },
    });
    res.json({ emailed: mail.sent, ...(mail.reason ? { reason: mail.reason } : {}) });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ORDER RESEND RECEIPT");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── PATCH /api/admin/orders/:id/payment-status — update payment status ────────────
// Mirrors the order-status endpoint: a locked, audited, transition-checked change via
// admin_set_payment_status, busting the owner's cache on success.
router.patch("/:id/payment-status", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN PAYMENT STATUS");
  const adminId = (req as AuthenticatedRequest).userId;
  const orderId = req.params.id as string;
  const status = String((req.body as { paymentStatus?: unknown })?.paymentStatus ?? "").toLowerCase() as PaymentStatus;
  // Optional admin note/reminder attached to this change. Trim + cap so a stray huge
  // payload can't bloat the audit row; empty becomes null.
  const rawNote = String((req.body as { note?: unknown })?.note ?? "").trim();
  const note = rawNote ? rawNote.slice(0, 500) : null;
  // Override = a deliberate correction; bypasses the normal payment transition machine
  // and flags the change as a correction in the audit trail.
  const override = (req.body as { override?: unknown })?.override === true;
  // Optimistic concurrency guard: matches the order-status endpoint.
  const expectedStatus = (req.body as { expectedStatus?: unknown })?.expectedStatus as string | null ?? null;
  log.step(`admin=${adminId}  order=${orderId}  → payment=${status}  override=${override}  expected=${expectedStatus ?? "any"}  note=${note ? `"${note.slice(0, 40)}…"` : "none"}`);

  if (!VALID_PAYMENT_STATUSES.includes(status)) {
    log.warn(`invalid payment status="${status}"`).end("ADMIN PAYMENT STATUS");
    res.status(400).json({ error: `Invalid payment status. Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}` });
    return;
  }

  try {
    // Snapshot the acting admin's identity into the audit row so the trail stays
    // readable even if this admin's profile is later changed or removed.
    const adminProfiles = await loadProfiles([adminId]);
    const admin = adminProfiles.get(adminId);
    const adminName = [admin?.first_name, admin?.last_name].filter(Boolean).join(" ").trim() || "Admin";
    const adminEmail = admin?.email ?? "";

    // Atomic: locks the order row, validates the transition, updates payment_status,
    // and appends the audit entry in a single transaction (admin_set_payment_status).
    const { data, error } = await db().rpc("admin_set_payment_status", {
      p_order_id: orderId,
      p_status: status,
      p_admin_id: adminId,
      p_admin_name: adminName,
      p_admin_email: adminEmail,
      p_note: note,
      p_override: override,
      p_expected_status: expectedStatus,
    });

    if (error) {
      log.error(`update failed  code=${error.code}  msg=${error.message}`, error).end("ADMIN PAYMENT STATUS");
      res.status(500).json({ error: error.message });
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as
      | { owner_id: string; from_status: string; result: "changed" | "unchanged" | "invalid" | "conflict" }
      | undefined;

    if (!result) {
      log.warn(`not found  order=${orderId}`).end("ADMIN PAYMENT STATUS");
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (result.result === "conflict") {
      log.warn(`stale edit  order=${orderId}  expected=${expectedStatus}  actual=${result.from_status}`).end("ADMIN PAYMENT STATUS");
      res.status(409).json({
        error: `Payment status was updated by another admin — current status is "${result.from_status}".`,
        currentStatus: result.from_status,
      });
      return;
    }

    if (result.result === "invalid") {
      log.warn(`illegal transition  order=${orderId}  ${result.from_status}→${status}`).end("ADMIN PAYMENT STATUS");
      res.status(400).json({ error: `Cannot change payment status from "${result.from_status}" to "${status}".` });
      return;
    }

    if (result.result === "unchanged") {
      log.success(`no change  order=${orderId}  already=${status}`).end("ADMIN PAYMENT STATUS");
      res.json({ success: true, unchanged: true });
      return;
    }

    // Bust the OWNER's cached order list + detail so the customer sees the new payment
    // status immediately (same keys orders.ts writes).
    const ownerId = result.owner_id;
    await redisDel(
      log,
      redisKey("order", `list:${ownerId}`),
      redisKey("order", `detail:${ownerId}:${orderId}`),
    );

    log.success(`updated  order=${orderId}  ${result.from_status}→${status}  by=${adminName}  owner=${ownerId}`).end("ADMIN PAYMENT STATUS");
    void logAdminAction({
      adminId,
      action: "payment_status_changed",
      targetType: "order",
      targetId: orderId,
      summary: `Changed payment status ${result.from_status} → ${status}`,
      metadata: { orderId, fromStatus: result.from_status, toStatus: status, override, note },
    });
    res.json({ success: true });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN PAYMENT STATUS");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /api/admin/orders/auto-process — auto-transition confirmed → processing ──
// Triggered by pg_cron on Supabase Pro+, or manually called every 5 minutes from
// a backend scheduler. Idempotent: only affects orders that are "confirmed" and
// were placed 10+ minutes ago.
router.post("/auto-process", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("AUTO PROCESS");

  try {
    log.step("calling auto_confirm_to_processing() RPC");
    const t0 = performance.now();
    const { data, error } = await db().rpc("auto_confirm_to_processing");

    if (error) {
      log.error(`RPC failed  ${error.message}`, error).end("AUTO PROCESS");
      res.status(500).json({ error: error.message });
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const transitionedCount = result?.transitioned_count ?? 0;
    const errorMessage = result?.error_message ?? null;

    // Email the just-transitioned customers their "now processing" notice. Fire-and-forget
    // so the endpoint stays fast; the sweep is idempotent + dedup-guarded, so triggering it
    // here (free-tier path) and from the boot interval (pg_cron path) can't double-send.
    if (transitionedCount > 0) {
      void sweepAutoProcessedNotifications();
    }

    if (errorMessage) {
      log.warn(`completed with errors  transitioned=${transitionedCount}  errors=${errorMessage}`);
      res.json({
        success: true,
        transitioned: transitionedCount,
        warnings: errorMessage,
      });
    } else {
      log.success(`transitioned ${transitionedCount} order(s)  elapsed=${fms(performance.now() - t0)}`).end("AUTO PROCESS");
      res.json({ success: true, transitioned: transitionedCount });
    }
  } catch (err) {
    log.error("unhandled error", err).end("AUTO PROCESS");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
