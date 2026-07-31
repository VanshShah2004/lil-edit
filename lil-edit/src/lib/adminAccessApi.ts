import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

// ─── Shapes (mirror backend routes/adminAccess.ts) ───────────────────────────
export interface AdminEntry {
  /** Profile id, or null for a protected owner that hasn't signed up yet. */
  id: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** A hardcoded owner — cannot be revoked. */
  isRoot: boolean;
  /** This is the currently signed-in admin — cannot self-revoke. */
  isSelf: boolean;
  /** False for an owner email with no account yet. */
  accountExists: boolean;
}

export interface PendingEntry {
  email: string;
  addedByEmail: string | null;
  createdAt: string | null;
}

export interface AccessList {
  admins: AdminEntry[];
  pending: PendingEntry[];
}

export interface MutationResult {
  status: string;
  email: string;
  profileExists: boolean;
  role: string | null;
  message: string;
}

// ─── Authed fetch (requireAuth + requireAdmin on the backend) ────────────────
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[adminAccessApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[adminAccessApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

export async function fetchAccessList(): Promise<AccessList> {
  const res = await authFetch(`/api/admin/access`);
  if (!res.ok) throw await errorFrom(res, "Could not load admin access");
  const data = (await res.json()) as AccessList;
  return { admins: data.admins ?? [], pending: data.pending ?? [] };
}

export async function grantAdmin(email: string): Promise<MutationResult> {
  const res = await authFetch(`/api/admin/access/grant`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw await errorFrom(res, "Could not grant admin access");
  return (await res.json()) as MutationResult;
}

export async function revokeAdmin(email: string): Promise<MutationResult> {
  const res = await authFetch(`/api/admin/access/revoke`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw await errorFrom(res, "Could not remove admin access");
  return (await res.json()) as MutationResult;
}
