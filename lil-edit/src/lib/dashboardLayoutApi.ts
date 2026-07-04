import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getBackendBaseUrl } from "@/lib/backend";
import { authHeader } from "@/lib/apiAuth";

// ─── Dashboard layout API ─────────────────────────────────────────────────────
// Global, admin-shared card visibility for the analytics platform. The backend
// (/api/admin/analytics/layout) stores which cards are HIDDEN per page — one row
// per hidden card, shared by every admin. This client reads that list and toggles
// it. Everything is FAIL-OPEN: if the layout can't be read, callers treat it as
// "nothing hidden" so the dashboard always renders every card.

function layoutUrl(page: string): string {
  return `${getBackendBaseUrl()}/api/admin/analytics/layout?page=${encodeURIComponent(page)}`;
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** GET the hidden widget ids for a page. Never throws — returns [] on any failure. */
export async function fetchDashboardLayout(page: string): Promise<string[]> {
  const url = layoutUrl(page);
  console.log(`[dashboardLayoutApi] GET ${url}`);
  try {
    const res = await fetch(url, { headers: { ...(await authHeader()) } });
    console.log(`[dashboardLayoutApi] GET ${url} → ${res.status}`);
    if (!res.ok) {
      console.warn(`[dashboardLayoutApi] read failed (${res.status}) — treating as nothing hidden`);
      return [];
    }
    const body = (await res.json()) as { hidden?: unknown };
    return asStringList(body.hidden);
  } catch (err) {
    console.warn("[dashboardLayoutApi] read threw — treating as nothing hidden:", err);
    return [];
  }
}

/** POST a single card's visibility. Returns the fresh full hidden list for the page. */
export async function setWidgetHidden(page: string, widgetId: string, hidden: boolean): Promise<string[]> {
  const url = `${getBackendBaseUrl()}/api/admin/analytics/layout`;
  console.log(`[dashboardLayoutApi] POST ${url}  ${page}/${widgetId} hidden=${hidden}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ page, widgetId, hidden }),
  });
  console.log(`[dashboardLayoutApi] POST ${url} → ${res.status}`);
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Could not update layout (${res.status})`);
  }
  const body = (await res.json()) as { hidden?: unknown };
  return asStringList(body.hidden);
}

export interface DashboardLayout {
  hidden: Set<string>;
  isLoading: boolean;
  hide: (widgetId: string) => void;
  show: (widgetId: string) => void;
}

const layoutKey = (page: string) => ["dashboard-layout", page] as const;

/**
 * React Query hook for a page's shared hidden-card set. Toggles are OPTIMISTIC
 * (the card flips instantly, then reconciles to the server on settle) and roll
 * back on error. `refetchOnWindowFocus` keeps admins roughly in sync since the
 * state is shared across all of them.
 */
export function useDashboardLayout(page: string): DashboardLayout {
  const qc = useQueryClient();
  const key = layoutKey(page);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchDashboardLayout(page),
    // Non-pilot pages pass an empty page and never fetch (customization is off).
    enabled: page.trim().length > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    mutationFn: ({ widgetId, hidden }: { widgetId: string; hidden: boolean }) =>
      setWidgetHidden(page, widgetId, hidden),
    onMutate: async ({ widgetId, hidden }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<string[]>(key) ?? [];
      const next = hidden
        ? Array.from(new Set([...prev, widgetId]))
        : prev.filter((id) => id !== widgetId);
      qc.setQueryData<string[]>(key, next);
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      console.warn("[dashboardLayoutApi] toggle failed — rolling back:", err);
      if (ctx?.prev) qc.setQueryData<string[]>(key, ctx.prev);
    },
    // Reconcile to server truth once the toggle settles. The POST also returns the
    // authoritative list, but a single invalidate avoids clobbering when several
    // toggles are in flight at once.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const hidden = useMemo(() => new Set(query.data ?? []), [query.data]);

  // Stable across renders (mutate is referentially stable) so the CustomizeProvider
  // can safely memoize its context value on them.
  const { mutate } = mutation;
  const hide = useCallback((widgetId: string) => mutate({ widgetId, hidden: true }), [mutate]);
  const show = useCallback((widgetId: string) => mutate({ widgetId, hidden: false }), [mutate]);

  return { hidden, isLoading: query.isLoading, hide, show };
}
