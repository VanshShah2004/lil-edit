import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

// ─── Shapes (mirror backend routes/newsletter.ts) ────────────────────────────
export interface Subscriber {
  id: string;
  email: string;
  /** ISO timestamp of when the address joined the list. */
  createdAt: string | null;
  /** Null when the address has no account — the footer form takes any email. */
  firstName: string | null;
  lastName: string | null;
  /** True when the email matches a profiles row. */
  hasAccount: boolean;
}

export interface SubscriberList {
  subscribers: Subscriber[];
  total: number;
  withAccount: number;
  guests: number;
}

// ─── Authed fetch (requireAuth + requireAdmin on the backend) ────────────────
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[newsletterApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[newsletterApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `${fallback} (${res.status})`);
}

export async function fetchSubscribers(): Promise<SubscriberList> {
  const res = await authFetch(`/api/newsletter/subscribers`);
  if (!res.ok) throw await errorFrom(res, "Could not load newsletter subscribers");
  const data = (await res.json()) as Partial<SubscriberList>;
  const subscribers = data.subscribers ?? [];
  return {
    subscribers,
    total: data.total ?? subscribers.length,
    withAccount: data.withAccount ?? subscribers.filter((s) => s.hasAccount).length,
    guests: data.guests ?? subscribers.filter((s) => !s.hasAccount).length,
  };
}

// ─── Excel/CSV export ────────────────────────────────────────────────────────
// Escape per RFC 4180 — same rule the analytics DataTable uses.
function toCsvValue(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Excel parses this shape as a date without needing a locale hint.
  return d.toISOString().slice(0, 19).replace("T", " ");
}

const COLUMNS: { header: string; value: (s: Subscriber) => string }[] = [
  { header: "Email", value: (s) => s.email },
  { header: "First name", value: (s) => s.firstName ?? "" },
  { header: "Last name", value: (s) => s.lastName ?? "" },
  { header: "Has account", value: (s) => (s.hasAccount ? "Yes" : "No") },
  { header: "Subscribed on", value: (s) => formatWhen(s.createdAt) },
];

/**
 * Download the list as a spreadsheet. Written as CSV — which Excel owns by default
 * and opens directly — rather than a real .xlsx, so no spreadsheet dependency is
 * added to the bundle for one admin button.
 *
 * The leading BOM is what makes Excel read it as UTF-8; without it Excel falls back
 * to the system codepage and mangles any non-ASCII name.
 */
export function downloadSubscribersExcel(subscribers: Subscriber[]): void {
  const header = COLUMNS.map((c) => toCsvValue(c.header)).join(",");
  const body = subscribers
    .map((s) => COLUMNS.map((c) => toCsvValue(c.value(s))).join(","))
    .join("\n");

  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  console.log(`[newsletterApi] exported ${subscribers.length} subscribers → ${a.download}`);
}
