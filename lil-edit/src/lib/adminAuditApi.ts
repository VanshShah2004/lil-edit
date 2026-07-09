import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

// Mirrors AdminActionType in backend/lib/adminAudit.ts.
export type AdminActionType =
  | "product_launched"
  | "product_draft_saved"
  | "product_deleted"
  | "coupon_created"
  | "coupon_updated"
  | "coupon_deleted"
  | "size_chart_created"
  | "size_chart_updated"
  | "size_chart_deleted"
  | "order_status_changed"
  | "payment_status_changed"
  | "curation_updated"
  | "curation_section_updated"
  | "admin_access_granted"
  | "admin_access_revoked"
  | "maintenance_enabled"
  | "maintenance_disabled";

// The filter categories the feed offers — each maps to a set of actions server-side
// (see ACTION_CATEGORIES in backend/routes/adminAuditLog.ts). "merchandising" covers
// coupons + Spotlight curation; "platform" covers admin-access + site maintenance.
export type AuditCategory = "products" | "merchandising" | "orders" | "platform";

export interface AuditAdmin {
  id: string;
  name: string;
  email: string;
}

export interface AuditActionItem {
  id: string;
  action: AdminActionType;
  targetType: string | null;
  targetId: string | null;
  // Human-readable one-liner captured at write time — the durable description.
  summary: string;
  // Action-specific extras — shape depends on `action` (see the backend call sites).
  // Read defensively in the UI.
  metadata: Record<string, unknown>;
  createdAt: string;
  // Null when the acting admin's account was removed since (ON DELETE SET NULL).
  admin: AuditAdmin | null;
}

export interface AuditResponse {
  actions: AuditActionItem[];
  // Cursor for the next (older) page — pass as `before`. Null when there are no more.
  nextCursor: string | null;
}

export interface AuditQuery {
  limit?: number;
  category?: AuditCategory;
  before?: string;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[adminAuditApi] token:", session?.access_token ? "present" : "missing");
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[adminAuditApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[adminAuditApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

export async function fetchAuditLog(query: AuditQuery = {}): Promise<AuditResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit ?? 50));
  if (query.category) params.set("category", query.category);
  if (query.before) params.set("before", query.before);

  const res = await authFetch(`/api/admin/audit-log?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[adminAuditApi] fetchAuditLog error:", body);
    throw new Error((body as { error?: string }).error ?? `Audit log fetch failed (${res.status})`);
  }
  const data = (await res.json()) as AuditResponse;
  console.log("[adminAuditApi] fetchAuditLog →", data.actions?.length ?? 0, "items");
  return data;
}
