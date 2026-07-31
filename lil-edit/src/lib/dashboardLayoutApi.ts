import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getBackendBaseUrl } from "@/lib/backend";
import { authHeader } from "@/lib/apiAuth";

// ─── Dashboard layout API ─────────────────────────────────────────────────────
// Global, admin-shared card layout for the analytics platform. The backend
// (/api/admin/analytics/layout) stores, per page, which cards are HIDDEN and the
// per-section ORDER cards are arranged in — both shared by every admin. This
// client reads that state and toggles/reorders it. Everything is FAIL-OPEN: if the
// layout can't be read, callers treat it as "nothing hidden, default order" so the
// dashboard always renders every card in its author order.

export interface DashboardLayoutData {
  hidden: string[];
  // group_key → ordered card ids. A group absent here (or a card absent from its
  // list) falls back to author order.
  order: Record<string, string[]>;
}

function layoutUrl(page: string): string {
  return `${getBackendBaseUrl()}/api/admin/analytics/layout?page=${encodeURIComponent(page)}`;
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asOrderMap(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = asStringList(val);
  }
  return out;
}

/** GET the hidden ids + per-section order for a page. Never throws — returns the
 *  empty layout on any failure. */
export async function fetchDashboardLayout(page: string): Promise<DashboardLayoutData> {
  const url = layoutUrl(page);
  console.log(`[dashboardLayoutApi] GET ${url}`);
  try {
    const res = await fetch(url, { headers: { ...(await authHeader()) } });
    console.log(`[dashboardLayoutApi] GET ${url} → ${res.status}`);
    if (!res.ok) {
      console.warn(`[dashboardLayoutApi] read failed (${res.status}) — treating as default layout`);
      return { hidden: [], order: {} };
    }
    const body = (await res.json()) as { hidden?: unknown; order?: unknown };
    return { hidden: asStringList(body.hidden), order: asOrderMap(body.order) };
  } catch (err) {
    console.warn("[dashboardLayoutApi] read threw — treating as default layout:", err);
    return { hidden: [], order: {} };
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

/** POST a section's new card order. Returns the saved ordered ids for the group. */
export async function setWidgetOrder(page: string, groupKey: string, orderedIds: string[]): Promise<string[]> {
  const url = `${getBackendBaseUrl()}/api/admin/analytics/layout/order`;
  console.log(`[dashboardLayoutApi] POST ${url}  ${page}/${groupKey} n=${orderedIds.length}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ page, groupKey, orderedIds }),
  });
  console.log(`[dashboardLayoutApi] POST ${url} → ${res.status}`);
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error ?? `Could not save order (${res.status})`);
  }
  const body = (await res.json()) as { orderedIds?: unknown };
  return asStringList(body.orderedIds);
}

export interface DashboardLayout {
  hidden: Set<string>;
  order: Record<string, string[]>;
  isLoading: boolean;
  hide: (widgetId: string) => void;
  show: (widgetId: string) => void;
  reorder: (groupKey: string, orderedIds: string[]) => void;
}

const layoutKey = (page: string) => ["dashboard-layout", page] as const;
const EMPTY_LAYOUT: DashboardLayoutData = { hidden: [], order: {} };

/**
 * React Query hook for a page's shared layout (hidden set + per-section order).
 * Both hide/show and reorder are OPTIMISTIC (the change applies instantly, then
 * reconciles to the server on settle) and roll back on error. `refetchOnWindowFocus`
 * keeps admins roughly in sync since the state is shared across all of them.
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

  const hideMutation = useMutation({
    mutationFn: ({ widgetId, hidden }: { widgetId: string; hidden: boolean }) =>
      setWidgetHidden(page, widgetId, hidden),
    onMutate: async ({ widgetId, hidden }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DashboardLayoutData>(key) ?? EMPTY_LAYOUT;
      const nextHidden = hidden
        ? Array.from(new Set([...prev.hidden, widgetId]))
        : prev.hidden.filter((id) => id !== widgetId);
      qc.setQueryData<DashboardLayoutData>(key, { ...prev, hidden: nextHidden });
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      console.warn("[dashboardLayoutApi] hide toggle failed — rolling back:", err);
      if (ctx?.prev) qc.setQueryData<DashboardLayoutData>(key, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const orderMutation = useMutation({
    mutationFn: ({ groupKey, orderedIds }: { groupKey: string; orderedIds: string[] }) =>
      setWidgetOrder(page, groupKey, orderedIds),
    onMutate: async ({ groupKey, orderedIds }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DashboardLayoutData>(key) ?? EMPTY_LAYOUT;
      qc.setQueryData<DashboardLayoutData>(key, { ...prev, order: { ...prev.order, [groupKey]: orderedIds } });
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      console.warn("[dashboardLayoutApi] reorder failed — rolling back:", err);
      if (ctx?.prev) qc.setQueryData<DashboardLayoutData>(key, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const data = query.data ?? EMPTY_LAYOUT;
  const hidden = useMemo(() => new Set(data.hidden), [data.hidden]);

  // Stable across renders (mutate is referentially stable) so the CustomizeProvider
  // can safely memoize its context value on them.
  const { mutate: hideMutate } = hideMutation;
  const { mutate: orderMutate } = orderMutation;
  const hide = useCallback((widgetId: string) => hideMutate({ widgetId, hidden: true }), [hideMutate]);
  const show = useCallback((widgetId: string) => hideMutate({ widgetId, hidden: false }), [hideMutate]);
  const reorder = useCallback(
    (groupKey: string, orderedIds: string[]) => orderMutate({ groupKey, orderedIds }),
    [orderMutate],
  );

  return { hidden, order: data.order, isLoading: query.isLoading, hide, show, reorder };
}
