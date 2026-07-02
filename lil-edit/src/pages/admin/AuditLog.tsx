import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutGrid,
  Loader2,
  Package,
  Pause,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Ticket,
  Trash2,
} from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchAuditLog,
  type AdminActionType,
  type AuditActionItem,
  type AuditAdmin,
  type AuditCategory,
} from "@/lib/adminAuditApi";

const ACCENT = "#0F766E";
const POLL_MS = 20_000; // refresh the newest page every 20s while "live"

type FilterKey = AuditCategory | "all";

const CATEGORY_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "products", label: "Products" },
  { key: "merchandising", label: "Merchandising" },
  { key: "orders", label: "Orders" },
  { key: "platform", label: "Platform" },
];

// ── metadata readers (metadata is Record<string, unknown> — read defensively) ──
const asStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const asNum = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

function adminName(admin: AuditAdmin | null): string {
  if (!admin) return "A removed admin";
  if (admin.name) return admin.name;
  if (admin.email) return admin.email.split("@")[0];
  return "An admin";
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return "1 day ago"; // capped — the exact date & time is shown beneath it
}

// Exact timestamp shown under the relative label, e.g. "2 Jul 2026, 3:45 pm".
function fullDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface Visual {
  Icon: typeof Package;
  color: string;
  bg: string;
}

const RED = { color: "#DC2626", bg: "rgba(220,38,38,0.10)" };
const GREEN = { color: "#16A34A", bg: "rgba(22,163,74,0.10)" };
const TEAL = { color: "#0F766E", bg: "rgba(15,118,110,0.10)" };

function visualFor(action: AdminActionType): Visual {
  switch (action) {
    case "product_launched":
      return { Icon: Package, ...TEAL };
    case "product_draft_saved":
      return { Icon: FileText, color: "#6B7280", bg: "rgba(107,114,128,0.12)" };
    case "product_deleted":
      return { Icon: Trash2, ...RED };
    case "coupon_created":
      return { Icon: Ticket, ...GREEN };
    case "coupon_updated":
      return { Icon: Ticket, color: "#D97706", bg: "rgba(217,119,6,0.12)" };
    case "coupon_deleted":
      return { Icon: Ticket, ...RED };
    case "order_status_changed":
      return { Icon: ClipboardList, color: "#2563EB", bg: "rgba(37,99,235,0.10)" };
    case "payment_status_changed":
      return { Icon: CreditCard, color: "#4F46E5", bg: "rgba(79,70,229,0.10)" };
    case "curation_updated":
    case "curation_section_updated":
      return { Icon: LayoutGrid, ...TEAL };
    case "admin_access_granted":
      return { Icon: ShieldCheck, ...GREEN };
    case "admin_access_revoked":
      return { Icon: ShieldOff, ...RED };
    case "maintenance_enabled":
      return { Icon: PowerOff, ...RED };
    case "maintenance_disabled":
      return { Icon: Power, ...GREEN };
    default:
      return { Icon: ShieldAlert, color: "#6B7280", bg: "rgba(107,114,128,0.12)" };
  }
}

// Prettify a raw db field name for a chip, e.g. "is_active" → "is active".
const prettyField = (f: string): string => f.replace(/_/g, " ");

// Structured extras rendered as small chips beneath the summary. Everything here is
// read defensively from metadata (shape depends on the action).
function chipsFor(item: AuditActionItem): string[] {
  const m = item.metadata ?? {};
  switch (item.action) {
    case "order_status_changed":
    case "payment_status_changed": {
      const from = asStr(m.fromStatus);
      const to = asStr(m.toStatus);
      const chips: string[] = [];
      if (from && to) chips.push(`${from} → ${to}`);
      if (m.override === true) chips.push("Correction");
      if (item.action === "order_status_changed" && m.emailed === true) chips.push("Customer emailed");
      return chips;
    }
    case "curation_updated": {
      const n = asNum(m.itemCount);
      return [`${n} item${n === 1 ? "" : "s"}`];
    }
    case "coupon_updated":
    case "curation_section_updated": {
      const fields = Array.isArray(m.fields) ? (m.fields as unknown[]).map(asStr).filter(Boolean) : [];
      return fields.slice(0, 4).map(prettyField);
    }
    case "coupon_created": {
      const dt = asStr(m.discount_type);
      const dv = asNum(m.discount_value);
      if (!dt) return [];
      return [dt === "percentage" ? `${dv}% off` : `₹${dv} off`];
    }
    default:
      return [];
  }
}

// Order actions deep-link to the admin order detail (targetId is the order id).
function linkFor(item: AuditActionItem): string | undefined {
  if ((item.action === "order_status_changed" || item.action === "payment_status_changed") && item.targetId) {
    return `/admin/orders/${item.targetId}`;
  }
  return undefined;
}

const ActionRow = ({ item }: { item: AuditActionItem }) => {
  const { Icon, color, bg } = visualFor(item.action);
  const chips = chipsFor(item);
  const to = linkFor(item);
  const who = adminName(item.admin);

  const body = (
    <div className="flex items-start gap-3.5 px-5 py-3.5">
      <span
        className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
        style={{ backgroundColor: bg }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </span>
      <div className="min-w-0 flex-1">
        {/* The durable, server-written description is the primary line. */}
        <p className="text-sm text-gray-800 leading-snug font-medium">{item.summary}</p>
        <p className="text-[13px] text-gray-400 mt-0.5 truncate">
          by <span className="font-semibold text-gray-500">{who}</span>
          {item.admin?.email ? ` · ${item.admin.email}` : ""}
        </p>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {chips.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded-md bg-gray-100 text-[11px] font-semibold text-gray-600"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end shrink-0 mt-0.5 text-right">
        <span className="text-[11px] text-gray-500 whitespace-nowrap">{timeAgo(item.createdAt)}</span>
        <span className="text-[12px] text-gray-400 whitespace-nowrap">{fullDateTime(item.createdAt)}</span>
      </div>
    </div>
  );

  if (to) {
    return (
      <li className="hover:bg-gray-50 transition-colors">
        <Link to={to}>{body}</Link>
      </li>
    );
  }
  return <li className="hover:bg-gray-50 transition-colors">{body}</li>;
};

const AuditLog = () => {
  const [items, setItems] = useState<AuditActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [live, setLive] = useState(true);
  // Pausing the live feed requires typing a confirmation word; these back that dialog.
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseConfirm, setPauseConfirm] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Admin Activity | Lil Edit";
  }, []);

  const categoryParam = filter === "all" ? undefined : filter;

  // Initial load / full reset (also runs when the category filter changes).
  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const data = await fetchAuditLog({ category: categoryParam, limit: 50 });
      setItems(data.actions);
      setNextCursor(data.nextCursor);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load admin activity.";
      setLoadError(msg);
      console.error("[AuditLog] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [categoryParam]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll / manual refresh: fetch the newest page and prepend anything we haven't
  // seen (dedupe by id). Leaves the "load more" cursor untouched.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchAuditLog({ category: categoryParam, limit: 50 });
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        const fresh = data.actions.filter((i) => !seen.has(i.id));
        if (fresh.length === 0) return prev;
        console.log(`[AuditLog] +${fresh.length} new`);
        return [...fresh, ...prev];
      });
    } catch (err) {
      console.error("[AuditLog] refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [categoryParam]);

  // Live polling — restart whenever the toggle or filter changes.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [live, refresh]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchAuditLog({ category: categoryParam, limit: 50, before: nextCursor });
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...data.actions.filter((i) => !seen.has(i.id))];
      });
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error("[AuditLog] loadMore failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, categoryParam]);

  // Toggle live updates. Resuming is one-click; pausing opens a typed-confirmation
  // dialog (the admin must type PAUSE) so it can't be turned off by accident.
  const handleToggleLive = () => {
    if (live) {
      setPauseConfirm("");
      setPauseOpen(true);
    } else {
      setLive(true);
      toast.success("Live updates resumed");
    }
  };

  const pauseConfirmed = pauseConfirm.trim().toUpperCase() === "PAUSE";

  // ── Draggable segmented filter ──────────────────────────────────────────────
  const filterTrackRef = useRef<HTMLDivElement | null>(null);
  const filterBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const draggingRef = useRef(false);
  // Set true when a drag/press actually changed the selection, so the click that
  // follows a pointer interaction doesn't re-fire selection on the wrong segment.
  const didDragRef = useRef(false);
  // Mirrors draggingRef as state so the indicator can react to it (CSS transitions
  // can't read a ref). While actively dragging, the pointer handlers below own the
  // indicator's position directly (continuous, follows the raw pointer x — so
  // between two segments it visually straddles both); the eased snap-to-segment
  // transition is reserved for a tap/click or the settle right after release.
  const [isDragging, setIsDragging] = useState(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const activeIndex = Math.max(0, CATEGORY_FILTERS.findIndex((f) => f.key === filter));
  // Content-box bounds (first segment's left → last segment's right) + the shared
  // segment width, captured once per drag so they stay stable while dragging even
  // as `filter` (and thus which button is "active") changes mid-gesture.
  const dragMetricsRef = useRef<{ contentLeft: number; contentWidth: number; segmentWidth: number } | null>(null);

  // Slide the active-segment indicator over the selected option and re-measure on
  // resize. Skipped while dragging — the pointer handlers own the indicator then.
  useLayoutEffect(() => {
    if (isDragging) return;
    const measure = () => {
      const track = filterTrackRef.current;
      const btn = filterBtnRefs.current[activeIndex];
      // Subtract the track's left border so the absolutely-positioned indicator
      // (measured from the padding box) aligns with the button (offsetLeft counts
      // the border).
      if (track && btn) setIndicator({ left: btn.offsetLeft - track.clientLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIndex, isDragging]);

  // Measure the track's content box (segments are flex-1, so all are equal width)
  // once at the start of a drag/press.
  const captureDragMetrics = () => {
    const track = filterTrackRef.current;
    const first = filterBtnRefs.current[0];
    const last = filterBtnRefs.current[CATEGORY_FILTERS.length - 1];
    if (!track || !first || !last) return;
    const contentLeft = first.offsetLeft - track.clientLeft;
    const contentWidth = last.offsetLeft - track.clientLeft + last.offsetWidth - contentLeft;
    dragMetricsRef.current = { contentLeft, contentWidth, segmentWidth: contentWidth / CATEGORY_FILTERS.length };
  };

  // Move the indicator to directly track the pointer (clamped to the track), and
  // update the selected filter to whichever segment the indicator's CENTER now sits
  // over. This is what produces the straddling look: the indicator's left/width are
  // driven by raw pointer position, not snapped to a segment's box, so mid-drag it
  // can sit half over one segment and half over the next.
  const followPointer = (clientX: number) => {
    const track = filterTrackRef.current;
    const metrics = dragMetricsRef.current;
    if (!track || !metrics) return;
    const trackRect = track.getBoundingClientRect();
    const rawLeft = clientX - trackRect.left - metrics.segmentWidth / 2;
    const left = Math.min(
      Math.max(rawLeft, metrics.contentLeft),
      metrics.contentLeft + metrics.contentWidth - metrics.segmentWidth,
    );
    setIndicator({ left, width: metrics.segmentWidth });

    const centerX = left + metrics.segmentWidth / 2;
    const idx = Math.min(
      CATEGORY_FILTERS.length - 1,
      Math.max(0, Math.floor((centerX - metrics.contentLeft) / metrics.segmentWidth)),
    );
    const key = CATEGORY_FILTERS[idx]?.key;
    if (key && key !== filter) {
      setFilter(key);
      didDragRef.current = true;
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      <UserNavbar />

      <div className="relative pt-[160px] md:pt-[128px] bg-white pb-0">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="space-y-1 mb-8">
            <div className="flex items-center min-h-[36px] sm:min-h-[46px]">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                Admin
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 pt-[10px] md:pt-0">Admin Activity</h1>
            <p className="text-sm text-gray-500">
              An audit trail of everything admins do — product, coupon, order, Spotlight, access and site changes.
            </p>
          </div>
          <hr className="-mx-6 lg:-mx-12 border-t border-foreground/50" />
        </div>
      </div>

      <main className="flex-1 px-6 lg:px-12 pt-4 pb-24 bg-gray-100">
        <div className="max-w-3xl mx-auto pt-4">
          {/* Controls */}
          <div className="mb-4 space-y-[20px]">
            {/* Draggable segmented filter — tap a segment or drag across them */}
            <div
              ref={filterTrackRef}
              onPointerDown={(e) => {
                draggingRef.current = true;
                didDragRef.current = false;
                setIsDragging(true);
                captureDragMetrics();
                e.currentTarget.setPointerCapture(e.pointerId);
                followPointer(e.clientX);
              }}
              onPointerMove={(e) => {
                if (draggingRef.current) followPointer(e.clientX);
              }}
              onPointerUp={(e) => {
                draggingRef.current = false;
                setIsDragging(false);
                dragMetricsRef.current = null;
                try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
              }}
              onPointerCancel={() => {
                draggingRef.current = false;
                setIsDragging(false);
                dragMetricsRef.current = null;
              }}
              className="relative flex w-full cursor-grab touch-none select-none rounded bg-gray-100 p-1 shadow-inner active:cursor-grabbing"
            >
              {/* Sliding active-segment indicator. No transition while actively
                  dragging (tracks the pointer 1:1, no rubber-banding); a quick,
                  smooth ease-out snap for taps and the release settle. */}
              <span
                aria-hidden
                className={`pointer-events-none absolute top-1 bottom-1 rounded bg-[#0F766E] ${
                  isDragging ? "" : "transition-[left,width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                }`}
                style={{ left: indicator.left, width: indicator.width }}
              />
              {CATEGORY_FILTERS.map((f, i) => {
                const active = filter === f.key;
                const showDivider = i !== CATEGORY_FILTERS.length - 1 && !active && filter !== CATEGORY_FILTERS[i + 1]?.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    ref={(el) => { filterBtnRefs.current[i] = el; }}
                    onClick={() => {
                      // Skip the click that trails a pointer selection (avoids
                      // re-selecting the segment the drag started on).
                      if (didDragRef.current) { didDragRef.current = false; return; }
                      setFilter(f.key);
                    }}
                    className={`relative z-10 flex-1 whitespace-nowrap rounded px-2 py-2 text-xs sm:text-sm font-semibold transition-colors ${
                      active ? "text-white" : "text-gray-600 hover:text-gray-900"
                    } ${showDivider ? "border-r-2 border-gray-300" : ""}`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleToggleLive}
                title={live ? "Pause live updates" : "Resume live updates"}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-400 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-500 transition-colors"
              >
                {live ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {live ? "Live" : "Paused"}
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                title="Refresh now"
                className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-[#B19CD9] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#9A82C9] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Feed card */}
          <div className="rounded-lg border border-gray-400 bg-white overflow-hidden shadow-lg">
            {loadError ? (
              <div className="p-5 bg-red-50">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-red-800">Couldn't load admin activity</p>
                    <p className="text-xs text-red-700 mt-1 break-words">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <ShieldCheck className="w-8 h-8 text-gray-300 mb-3" />
                <p className="text-sm font-semibold text-gray-700">No admin activity yet</p>
                <p className="text-xs text-gray-500 mt-1">
                  Admin actions — product, coupon, order, Spotlight, access and site changes — will show up here.
                </p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-gray-400">
                  {items.map((item) => (
                    <ActionRow key={item.id} item={item} />
                  ))}
                </ul>
                {nextCursor && (
                  <div className="p-3 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:border-gray-400 transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {loadingMore ? "Loading…" : "Load older activity"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <div className="border-t border-gray-400" />
      <Footer />

      <AlertDialog
        open={pauseOpen}
        onOpenChange={(open) => {
          setPauseOpen(open);
          if (!open) setPauseConfirm("");
        }}
      >
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle>Pause live updates?</AlertDialogTitle>
            <AlertDialogDescription>
              The feed will stop refreshing on its own until you resume it. Type{" "}
              <span className="font-semibold text-gray-900">PAUSE</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            autoFocus
            value={pauseConfirm}
            onChange={(e) => setPauseConfirm(e.target.value)}
            placeholder="Type PAUSE"
            className="w-full rounded-md border border-gray-400 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/30"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-400">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pauseConfirmed}
              onClick={(e) => {
                if (!pauseConfirmed) {
                  e.preventDefault();
                  return;
                }
                setLive(false);
                setPauseConfirm("");
                toast.info("Live updates paused");
              }}
              className="bg-[#0F766E] hover:bg-[#0d655e] focus:ring-[#0F766E]"
            >
              Pause feed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AuditLog;
