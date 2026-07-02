import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";
import type {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  OrderItem,
  OrderAddress,
} from "@/lib/ordersApi";

export type { OrderStatus, PaymentStatus, PaymentMethod, OrderItem, OrderAddress };

export interface AdminCustomer {
  userId: string;
  name: string;
  email: string;
  phone: string;
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  discount: number;
  shippingFee: number;
  tax: number;
  total: number;
  itemCount: number;
  createdAt: string;
  customer: AdminCustomer;
  items: OrderItem[];
}

// Shipping snapshot may carry a recipient name/phone in addition to the address.
export interface AdminShippingAddress extends OrderAddress {
  fullName?: string;
  phone?: string;
}

// One immutable audit-trail entry: who moved the order from one status to another,
// and when. `fromStatus` is null for the opening "order placed" entry.
export interface OrderStatusEvent {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string | null;
  changedByName: string;
  changedByEmail: string;
  // Optional admin note/reminder left with this change (admin view only).
  note: string | null;
  // True when this row was written via the terminal-state correction override.
  isCorrection: boolean;
  createdAt: string;
}

// One immutable payment-audit entry — same shape as OrderStatusEvent, but the
// from/to are payment statuses. `fromStatus` is null for the opening entry.
export interface PaymentStatusEvent {
  id: string;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  changedBy: string | null;
  changedByName: string;
  changedByEmail: string;
  note: string | null;
  // True when this row was written via the payment-status correction override.
  isCorrection: boolean;
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  transactionId: string | null;
  shippingAddress: AdminShippingAddress;
  statusHistory: OrderStatusEvent[];
  paymentStatusHistory: PaymentStatusEvent[];
  // Distinct statuses the customer has already been emailed about (drives the "already
  // notified" warning before a re-send). Empty if the notifications table isn't present.
  notifiedStatuses: OrderStatus[];
  // Whether the order-confirmation receipt has a recorded send (drives the receipt
  // indicator + "Resend receipt" action). False if the notifications table isn't present.
  receiptSent: boolean;
}

export interface AdminOrdersResponse {
  orders: AdminOrderSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type OrderSortKey = "newest" | "oldest" | "highest" | "lowest";

// The statuses an admin can SET (per the spec's Status Management section).
// `confirmed` is a valid DB status but isn't offered here — it's the order's
// starting status, not a destination.
export const SETTABLE_ORDER_STATUSES: OrderStatus[] = [
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

// Legal status transitions — mirrors the state machine enforced in the DB
// (admin_set_order_status / 20260610_order_status_transitions.sql). The backend is
// authoritative; this just keeps the UI from offering moves the server will reject.
// An order may jump FORWARD to any later stage, or be cancelled, but never move
// backward; delivered & cancelled are terminal (no outgoing transitions).
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  confirmed:  ["processing", "shipped", "delivered", "cancelled"],
  processing: ["shipped", "delivered", "cancelled"],
  shipped:    ["delivered", "cancelled"],
  delivered:  [],
  cancelled:  [],
};

// Statuses an admin may move TO from `from` — the current status first (so it stays
// selected), then its legal next states.
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return [from, ...(ORDER_TRANSITIONS[from] ?? [])];
}

// Legal payment-status transitions — mirrors admin_set_payment_status in the DB
// (20260617_paid_is_terminal.sql). The backend is authoritative; this just keeps
// the UI from offering moves the server will reject.
// Both `paid` and `refunded` are terminal in the normal flow. Issuing a refund
// requires the "Correct status" override path (audited, note mandatory).
export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending:  ["paid"],
  paid:     [],
  refunded: [],
};

// Payment statuses an admin may move TO from `from` — current first, then legal next.
export function nextPaymentStatuses(from: PaymentStatus): PaymentStatus[] {
  return [from, ...(PAYMENT_TRANSITIONS[from] ?? [])];
}

// Every payment status an admin can correct TO (the override path offers all but the
// current one).
export const SETTABLE_PAYMENT_STATUSES: PaymentStatus[] = ["pending", "paid", "refunded"];

export interface AdminOrdersQuery {
  search?: string;
  status?: OrderStatus | "all";
  paymentStatus?: PaymentStatus | "all";
  sort?: OrderSortKey;
  page?: number;
  limit?: number;
}

// Why a customer notification didn't go out — lets the UI show a precise message
// (no email on file vs. server not configured vs. an actual send failure).
export type NotifyFailureReason = "no_recipient" | "not_configured" | "send_failed";

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[adminOrdersApi] token:", session?.access_token ? "present" : "missing");
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[adminOrdersApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[adminOrdersApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

export async function fetchAdminOrders(query: AdminOrdersQuery = {}): Promise<AdminOrdersResponse> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.paymentStatus && query.paymentStatus !== "all") params.set("paymentStatus", query.paymentStatus);
  if (query.sort) params.set("sort", query.sort);
  params.set("page", String(query.page ?? 1));
  params.set("limit", String(query.limit ?? 20));

  const res = await authFetch(`/api/admin/orders?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[adminOrdersApi] fetchAdminOrders error:", body);
    throw new Error((body as { error?: string }).error ?? `Orders fetch failed (${res.status})`);
  }
  const data = (await res.json()) as AdminOrdersResponse;
  console.log("[adminOrdersApi] fetchAdminOrders →", data.orders?.length ?? 0, "of", data.total, "orders");
  return data;
}

export async function fetchAdminOrderById(orderId: string): Promise<AdminOrderDetail> {
  const res = await authFetch(`/api/admin/orders/${orderId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[adminOrdersApi] fetchAdminOrderById error:", body);
    throw new Error((body as { error?: string }).error ?? `Order fetch failed (${res.status})`);
  }
  const data = await res.json();
  console.log("[adminOrdersApi] fetchAdminOrderById →", data.order?.orderNumber ?? "?");
  const order = data.order as AdminOrderDetail;
  return {
    ...order,
    statusHistory: order.statusHistory ?? [],
    paymentStatusHistory: order.paymentStatusHistory ?? [],
    notifiedStatuses: order.notifiedStatuses ?? [],
    receiptSent: order.receiptSent ?? false,
  };
}

// Thrown when the server returns 409 — the admin's view was stale when they saved.
// The caller should reload the order and show a warning rather than treating it as
// a generic error.
export class ConflictError extends Error {
  readonly currentStatus: string;
  constructor(currentStatus: string, noun = "Order") {
    super(`${noun} was updated by another admin — current status is "${currentStatus}".`);
    this.name = "ConflictError";
    this.currentStatus = currentStatus;
  }
}

// `override` = a deliberate correction of a finalized (terminal) order. The backend
// requires a non-empty note when it's set and flags the change as a correction.
// `expectedStatus` = the status the admin read before editing; the server rejects the
// write with a ConflictError if someone else changed it in between.
// `notify` = email the customer about the new status (the "Notify customer" toggle).
// The response's `emailed` reflects whether that email actually went out.
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  note?: string,
  override?: boolean,
  expectedStatus?: OrderStatus,
  notify?: boolean,
): Promise<{ success: boolean; emailed?: boolean; reason?: NotifyFailureReason; unchanged?: boolean }> {
  const res = await authFetch(`/api/admin/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      note: note ?? "",
      override: override ?? false,
      expectedStatus: expectedStatus ?? null,
      notify: notify ?? false,
    }),
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new ConflictError((body as { currentStatus?: string }).currentStatus ?? status, "Order");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[adminOrdersApi] updateOrderStatus error:", body);
    throw new Error((body as { error?: string }).error ?? `Status update failed (${res.status})`);
  }
  const data = await res.json();
  console.log(`[adminOrdersApi] updateOrderStatus → ${orderId} = ${status}`, data);
  return data as { success: boolean; emailed?: boolean; reason?: NotifyFailureReason; unchanged?: boolean };
}

// Re-send the customer notification email for the order's CURRENT status, independent of
// any status change — the "Notify via Gmail" button in the Status History timeline. This
// is the recovery path for a notification that failed or needs sending again. `emailed`
// reflects whether the email actually went out.
export async function resendStatusNotification(
  orderId: string,
  // Explicit override — set only when the admin clicks "Send again" through the duplicate
  // warning. Omitted/false lets the server refuse an unconfirmed duplicate (see below).
  confirm = false,
): Promise<{ emailed: boolean; status?: OrderStatus; reason?: NotifyFailureReason; alreadySent?: boolean }> {
  const res = await authFetch(`/api/admin/orders/${orderId}/notify`, {
    method: "POST",
    body: JSON.stringify({ confirm }),
  });
  // 409 = the server's duplicate guard (this status was already notified and confirm wasn't
  // set). Surface it as DATA, not an error, so the page can show the "Send again" override —
  // the same warning whether the duplicate is caught client- or server-side.
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    return { emailed: false, alreadySent: true, status: (body as { status?: OrderStatus }).status };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[adminOrdersApi] resendStatusNotification error:", body);
    throw new Error((body as { error?: string }).error ?? `Notification failed (${res.status})`);
  }
  const data = await res.json();
  console.log(`[adminOrdersApi] resendStatusNotification → ${orderId}`, data);
  return data as { emailed: boolean; status: OrderStatus; reason?: NotifyFailureReason };
}

// (Re)send the order-confirmation receipt for this order — the recovery / send-again path
// for the receipt that's auto-sent at placement. `emailed` reflects whether it actually
// went out (the backend falls back to the auth email when the profile has none).
export async function resendReceipt(
  orderId: string,
  // Explicit override — set only when the admin clicks "Send again" through the duplicate
  // warning. Omitted/false lets the server refuse an unconfirmed duplicate (see below).
  confirm = false,
): Promise<{ emailed: boolean; reason?: NotifyFailureReason; alreadySent?: boolean }> {
  const res = await authFetch(`/api/admin/orders/${orderId}/resend-receipt`, {
    method: "POST",
    body: JSON.stringify({ confirm }),
  });
  // 409 = the server's duplicate guard (a receipt was already sent and confirm wasn't set).
  // Surface it as DATA so the page can show the "Send again" override toast.
  if (res.status === 409) {
    return { emailed: false, alreadySent: true };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[adminOrdersApi] resendReceipt error:", body);
    throw new Error((body as { error?: string }).error ?? `Receipt send failed (${res.status})`);
  }
  const data = await res.json();
  console.log(`[adminOrdersApi] resendReceipt → ${orderId}`, data);
  return data as { emailed: boolean; reason?: NotifyFailureReason };
}

// Best-effort: transitions any `confirmed` orders older than 10 minutes to
// `processing` (mirrors the DB's auto_confirm_to_processing() RPC). Called when the
// admin orders list loads so the table reflects the 10-minute auto-transition even
// on setups without pg_cron running in the background. Failures are swallowed —
// this is a freshness nudge, not a required step for the page to work.
export async function triggerAutoProcess(): Promise<{ transitioned: number }> {
  try {
    const res = await authFetch("/api/admin/orders/auto-process", { method: "POST" });
    if (!res.ok) {
      console.error("[adminOrdersApi] triggerAutoProcess failed:", res.status);
      return { transitioned: 0 };
    }
    const data = await res.json();
    console.log(`[adminOrdersApi] triggerAutoProcess → transitioned=${data.transitioned ?? 0}`);
    return { transitioned: data.transitioned ?? 0 };
  } catch (err) {
    console.error("[adminOrdersApi] triggerAutoProcess error:", err);
    return { transitioned: 0 };
  }
}

export async function updatePaymentStatus(
  orderId: string,
  paymentStatus: PaymentStatus,
  note?: string,
  override?: boolean,
  expectedStatus?: PaymentStatus,
): Promise<{ success: boolean }> {
  const res = await authFetch(`/api/admin/orders/${orderId}/payment-status`, {
    method: "PATCH",
    body: JSON.stringify({
      paymentStatus,
      note: note ?? "",
      override: override ?? false,
      expectedStatus: expectedStatus ?? null,
    }),
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new ConflictError((body as { currentStatus?: string }).currentStatus ?? paymentStatus, "Payment");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[adminOrdersApi] updatePaymentStatus error:", body);
    throw new Error((body as { error?: string }).error ?? `Payment status update failed (${res.status})`);
  }
  const data = await res.json();
  console.log(`[adminOrdersApi] updatePaymentStatus → ${orderId} = ${paymentStatus}`, data);
  return data as { success: boolean };
}
