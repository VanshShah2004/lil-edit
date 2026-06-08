import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "cod" | "online";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface OrderItem {
  id: string;
  // Live-catalog link, or null if the product has since been deleted. The
  // snapshot fields below always render the line; this is only for navigating
  // to the current product (reorder / view).
  productId: string | null;
  productSlug: string;
  categorySlug: string;
  sku: string;
  title: string;
  image: string;
  size: string;
  color: { name: string; hex: string };
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderAddress {
  label?: string;
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  itemCount: number;
  createdAt: string;
  items: OrderItem[];
}

export interface OrderDetail extends OrderSummary {
  shippingAddress: OrderAddress;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[ordersApi] token:", session?.access_token ? "present" : "missing");
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[ordersApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[ordersApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

export async function fetchOrders(): Promise<OrderSummary[]> {
  const res = await authFetch("/api/orders");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[ordersApi] fetchOrders error:", body);
    throw new Error((body as { error?: string }).error ?? `Orders fetch failed (${res.status})`);
  }
  const data = await res.json();
  console.log("[ordersApi] fetchOrders →", (data.orders ?? []).length, "orders");
  return (data.orders ?? []) as OrderSummary[];
}

export async function fetchOrderById(orderId: string): Promise<OrderDetail> {
  const res = await authFetch(`/api/orders/${orderId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[ordersApi] fetchOrderById error:", body);
    throw new Error((body as { error?: string }).error ?? `Order fetch failed (${res.status})`);
  }
  const data = await res.json();
  console.log("[ordersApi] fetchOrderById →", data.order?.orderNumber ?? "?");
  return data.order as OrderDetail;
}
