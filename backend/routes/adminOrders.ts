import { performance } from "perf_hooks";
import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createLog, fms } from "../lib/logger.js";
// redisDel/redisKey bust the OWNER's cached order list + detail on a status change.
import { redisDel, redisKey } from "../lib/redis.js";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;

// Mirror the DB CHECK constraint on orders.status.
const VALID_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"] as const;
type OrderStatus = (typeof VALID_STATUSES)[number];

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
  shipping_fee: number | string;
  tax: number | string | null;
  total: number | string;
  item_count: number;
  created_at: string;
  transaction_id?: string | null;
  shipping_address?: Record<string, unknown> | null;
  order_items?: OrderItemRow[];
  order_status_history?: StatusHistoryRow[];
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
        subtotal, discount, shipping_fee, tax, total, item_count, created_at,
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
        subtotal, discount, shipping_fee, tax, total, item_count, created_at,
        transaction_id, shipping_address,
        order_items(${ORDER_ITEMS_SELECT}),
        order_status_history(
          id, from_status, to_status, changed_by, changed_by_name, changed_by_email, created_at
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
    const profiles = await loadProfiles([row.user_id]);
    const order = mapOrder(row, profiles.get(row.user_id), true);

    log.success(`served  order=${order.orderNumber}  items=${order.items.length}  total=${fms(log.elapsed())}`).end("ADMIN ORDER DETAIL");
    res.json({ order });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ORDER DETAIL");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── PATCH /api/admin/orders/:id/status — update order status ─────────────────────
router.patch("/:id/status", async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN ORDER STATUS");
  const adminId = (req as AuthenticatedRequest).userId;
  const orderId = req.params.id as string;
  const status = String((req.body as { status?: unknown })?.status ?? "").toLowerCase() as OrderStatus;
  log.step(`admin=${adminId}  order=${orderId}  → status=${status}`);

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
    });

    if (error) {
      log.error(`update failed  code=${error.code}  msg=${error.message}`, error).end("ADMIN ORDER STATUS");
      res.status(500).json({ error: error.message });
      return;
    }

    // The function returns one row (or none for a missing order).
    const result = (Array.isArray(data) ? data[0] : data) as
      | { owner_id: string; from_status: string; result: "changed" | "unchanged" | "invalid" }
      | undefined;

    if (!result) {
      log.warn(`not found  order=${orderId}`).end("ADMIN ORDER STATUS");
      res.status(404).json({ error: "Order not found" });
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

    log.success(`updated  order=${orderId}  ${result.from_status}→${status}  by=${adminName}  owner=${ownerId}`).end("ADMIN ORDER STATUS");
    res.json({ success: true });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ORDER STATUS");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
