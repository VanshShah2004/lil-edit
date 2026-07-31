import { performance } from "perf_hooks";
import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { createLog, fms } from "../lib/logger.js";
import { redisGet, redisSet, redisKey, ORDER_TTL_S } from "../lib/redis.js";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;
const orderListKey   = (userId: string) => redisKey("order", `list:${userId}`);
// Detail keys are scoped by user so a cached payload can never leak to another
// account that requests the same order id.
const orderDetailKey = (userId: string, orderId: string) => redisKey("order", `detail:${userId}:${orderId}`);

// Columns selected for both list and detail (detail adds shipping_address).
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

// Customer-safe audit row: the status transition + when, but NOT who changed it.
// The acting admin's identity (changed_by/name/email) is deliberately omitted from
// the customer projection — it stays admin-only.
interface StatusHistoryRow {
  id: string;
  from_status: string | null;
  to_status: string;
  created_at: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number | string;
  discount: number | string;
  shipping_fee: number | string;
  total: number | string;
  item_count: number;
  created_at: string;
  shipping_address?: Record<string, unknown> | null;
  order_items?: OrderItemRow[];
  order_status_history?: StatusHistoryRow[];
}

function mapItem(row: OrderItemRow) {
  return {
    id: row.id,
    // Soft link to the live product (null if it was deleted) — for reorder /
    // "view product"; the snapshot fields below render the line regardless.
    productId: row.product_id ?? null,
    productSlug: row.product_slug,
    categorySlug: row.category_slug ?? "",
    sku: row.sku,
    title: row.title,
    image: row.image_url ?? "",
    size: row.size ?? "",
    color: { name: row.color_name ?? "", hex: row.color_hex ?? "#cccccc" },
    // NUMERIC columns can come back as strings over the wire — coerce to number.
    unitPrice: Number(row.unit_price) || 0,
    // Falls back to the paid price when unset, so the UI shows no fake discount.
    originalPrice: Number(row.original_price) || Number(row.unit_price) || 0,
    quantity: row.quantity,
    lineTotal: Number(row.line_total) || 0,
  };
}

function mapOrder(row: OrderRow, includeAddress: boolean) {
  const base = {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    subtotal: Number(row.subtotal) || 0,
    discount: Number(row.discount) || 0,
    shippingFee: Number(row.shipping_fee) || 0,
    total: Number(row.total) || 0,
    itemCount: row.item_count,
    createdAt: row.created_at,
    items: (row.order_items ?? []).map(mapItem),
  };
  if (!includeAddress) return base;
  return {
    ...base,
    shippingAddress: row.shipping_address ?? {},
    // Oldest → newest, so the customer reads it as their order's journey.
    statusHistory: (row.order_status_history ?? [])
      .map((h) => ({
        id: h.id,
        fromStatus: h.from_status,
        toStatus: h.to_status,
        createdAt: h.created_at,
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  };
}

// ─── GET /api/orders — list the caller's orders, newest first ────────────────────
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("ORDERS LIST");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}  client=${supabaseAdmin ? "admin" : "anon"}`);

  try {
    const cacheKey = orderListKey(userId);
    const cached = await redisGet<{ orders: unknown[] }>(cacheKey, log);
    if (cached) {
      log.success(`cache HIT  orders=${cached.orders.length}  total=${fms(log.elapsed())}`).end("ORDERS LIST");
      res.json(cached);
      return;
    }

    const t0 = performance.now();
    const { data, error } = await db()
      .from("orders")
      .select(`
        id, order_number, status, payment_method, payment_status,
        subtotal, discount, shipping_fee, total, item_count, created_at,
        order_items(${ORDER_ITEMS_SELECT})
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    log.step(`DB orders: ${fms(performance.now() - t0)}  rows=${data?.length ?? 0}`);

    if (error) {
      log.error(`orders query failed  code=${error.code}  msg=${error.message}`, error).end("ORDERS LIST");
      res.status(500).json({ error: error.message });
      return;
    }

    const orders = ((data ?? []) as unknown as OrderRow[]).map((o) => mapOrder(o, false));
    const payload = { orders };
    void redisSet(cacheKey, payload, ORDER_TTL_S, log);

    log.success(`cache MISS → SET  orders=${orders.length}  total=${fms(log.elapsed())}`).end("ORDERS LIST");
    res.json(payload);
  } catch (err) {
    log.error("unhandled error", err).end("ORDERS LIST");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── GET /api/orders/bought-items — deduplicated items across all user orders ────
// Must be registered before /:id so the literal path wins.
router.get("/bought-items", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("BOUGHT ITEMS");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`user=${userId}`);

  try {
    const t0 = performance.now();
    const { data, error } = await db()
      .from("orders")
      .select(`created_at, order_items(${ORDER_ITEMS_SELECT})`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    log.step(`DB: ${fms(performance.now() - t0)}  orders=${data?.length ?? 0}`);

    if (error) {
      log.error("query failed", error).end("BOUGHT ITEMS");
      res.status(500).json({ error: error.message });
      return;
    }

    // Flatten all items, newest order first, deduplicate by product_slug.
    const seen = new Set<string>();
    const items: ReturnType<typeof mapItem>[] = [];
    for (const order of (data ?? []) as unknown as { created_at: string; order_items: OrderItemRow[] }[]) {
      for (const item of order.order_items ?? []) {
        if (seen.has(item.product_slug)) continue;
        seen.add(item.product_slug);
        items.push(mapItem(item));
        if (items.length >= 10) break;
      }
      if (items.length >= 10) break;
    }

    log.success(`items=${items.length}  total=${fms(log.elapsed())}`).end("BOUGHT ITEMS");
    res.json({ items });
  } catch (err) {
    log.error("unhandled error", err).end("BOUGHT ITEMS");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── GET /api/orders/:id — single order detail (ownership-scoped) ─────────────────
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  const log = createLog().start("ORDER DETAIL");
  const userId = (req as AuthenticatedRequest).userId;
  const orderId = req.params.id as string;
  log.step(`user=${userId}  order=${orderId}`);

  try {
    const cacheKey = orderDetailKey(userId, orderId);
    const cached = await redisGet<{ order: unknown }>(cacheKey, log);
    if (cached) {
      log.success(`cache HIT  total=${fms(log.elapsed())}`).end("ORDER DETAIL");
      res.json(cached);
      return;
    }

    const t0 = performance.now();
    // Scoped by BOTH id and user_id: a non-owner gets no row → 404, never another
    // user's order.
    const { data, error } = await db()
      .from("orders")
      .select(`
        id, order_number, status, payment_method, payment_status,
        subtotal, discount, shipping_fee, total, item_count, created_at, shipping_address,
        order_items(${ORDER_ITEMS_SELECT}),
        order_status_history(id, from_status, to_status, created_at)
      `)
      .eq("id", orderId)
      .eq("user_id", userId)
      .maybeSingle();
    log.step(`DB order: ${fms(performance.now() - t0)}  found=${!!data}`);

    if (error) {
      log.error(`order query failed  code=${error.code}  msg=${error.message}`, error).end("ORDER DETAIL");
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      log.warn(`not found / not owned  order=${orderId}`).end("ORDER DETAIL");
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const order = mapOrder(data as unknown as OrderRow, true);
    const payload = { order };
    void redisSet(cacheKey, payload, ORDER_TTL_S, log);

    log.success(`served  order=${order.orderNumber}  items=${order.items.length}  total=${fms(log.elapsed())}`).end("ORDER DETAIL");
    res.json(payload);
  } catch (err) {
    log.error("unhandled error", err).end("ORDER DETAIL");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
