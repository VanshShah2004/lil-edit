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
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  transactionId: string | null;
  shippingAddress: AdminShippingAddress;
  statusHistory: OrderStatusEvent[];
}

export interface AdminOrdersResponse {
  orders: AdminOrderSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type OrderSortKey = "newest" | "oldest" | "highest" | "lowest";

// The five statuses an admin can SET (per the spec's Status Management section).
// `confirmed` is a valid DB status but isn't offered here.
export const SETTABLE_ORDER_STATUSES: OrderStatus[] = [
  "pending",
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
  pending:    ["processing", "shipped", "delivered", "cancelled"],
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

export interface AdminOrdersQuery {
  search?: string;
  status?: OrderStatus | "all";
  paymentStatus?: PaymentStatus | "all";
  sort?: OrderSortKey;
  page?: number;
  limit?: number;
}

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
  return { ...order, statusHistory: order.statusHistory ?? [] };
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<{ success: boolean }> {
  const res = await authFetch(`/api/admin/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[adminOrdersApi] updateOrderStatus error:", body);
    throw new Error((body as { error?: string }).error ?? `Status update failed (${res.status})`);
  }
  const data = await res.json();
  console.log(`[adminOrdersApi] updateOrderStatus → ${orderId} = ${status}`, data);
  return data as { success: boolean };
}
