import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

// ─── Shapes (mirror backend/routes/maintenance.ts) ───────────────────────────
export interface MaintenanceStatus {
  active: boolean;
  message: string | null;
  updatedAt: string | null;
}

export interface MaintenanceAdminState extends MaintenanceStatus {
  updatedByEmail: string | null;
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[maintenanceApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[maintenanceApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

/**
 * PUBLIC status — drives the coming-soon curtain for every visitor. No auth.
 * `signal` lets the caller abort a slow poll on unmount.
 */
export async function fetchMaintenanceStatus(signal?: AbortSignal): Promise<MaintenanceStatus> {
  const url = `${getBackendBaseUrl()}/api/maintenance/status`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load site status (${res.status})`);
  const data = (await res.json()) as Partial<MaintenanceStatus>;
  return {
    active: data.active === true,
    message: data.message ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

/** Admin read — current state + who last changed it, for the control panel. */
export async function fetchMaintenanceAdmin(): Promise<MaintenanceAdminState> {
  const res = await authFetch("/api/maintenance");
  if (!res.ok) throw await errorFrom(res, "Could not load maintenance settings");
  const data = (await res.json()) as Partial<MaintenanceAdminState>;
  return {
    active: data.active === true,
    message: data.message ?? null,
    updatedAt: data.updatedAt ?? null,
    updatedByEmail: data.updatedByEmail ?? null,
  };
}

/**
 * Admin toggle. `message === undefined` leaves the stored copy untouched; `""`
 * clears it (the page falls back to its default); any string sets it.
 */
export async function setMaintenanceMode(active: boolean, message?: string | null): Promise<MaintenanceAdminState> {
  const payload: { active: boolean; message?: string | null } = { active };
  if (message !== undefined) payload.message = message;
  const res = await authFetch("/api/maintenance", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await errorFrom(res, "Could not update site availability");
  const data = (await res.json()) as Partial<MaintenanceAdminState>;
  return {
    active: data.active === true,
    message: data.message ?? null,
    updatedAt: data.updatedAt ?? null,
    updatedByEmail: data.updatedByEmail ?? null,
  };
}
