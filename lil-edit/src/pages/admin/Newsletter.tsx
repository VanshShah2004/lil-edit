import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  UserCheck,
} from "lucide-react";

import AdminPageShell from "@/components/admin/AdminPageShell";
import {
  fetchSubscribers,
  downloadSubscribersExcel,
  type Subscriber,
  type SubscriberList,
} from "@/lib/newsletterApi";

const ACCENT = "#B19CD9";

const PAGE_SIZE = 25;

function displayName(s: Subscriber): string | null {
  const name = [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const Newsletter = () => {
  const [state, setState] = useState<SubscriberList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setLoadError(null);
    try {
      const data = await fetchSubscribers();
      setState(data);
      console.log(
        `[Newsletter] loaded ${data.total} subscribers — ${data.withAccount} with an account, ${data.guests} guests`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load the subscriber list.";
      setLoadError(msg);
      console.log(`[Newsletter] load failed — ${msg}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter on email AND name so searching a person by either one finds them.
  const filtered = useMemo(() => {
    const all = state?.subscribers ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((s) => {
      const name = displayName(s) ?? "";
      return s.email.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });
  }, [state, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A shrinking result set can strand the viewer past the last page — clamp on read
  // rather than trying to keep a page index and a filter in sync through effects.
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const handleExport = () => {
    // Export what the admin is currently looking at: with a search active that's the
    // filtered set, otherwise the whole list. Handing over rows they had just
    // filtered out would be the more surprising behaviour.
    if (filtered.length === 0) {
      toast.error("There's nothing to export.");
      return;
    }
    downloadSubscribersExcel(filtered);
    toast.success(`Downloaded ${filtered.length} subscriber${filtered.length === 1 ? "" : "s"}.`);
  };

  const stats: { label: string; value: number }[] = [
    { label: "Total subscribers", value: state?.total ?? 0 },
    { label: "With an account", value: state?.withAccount ?? 0 },
    { label: "Guests", value: state?.guests ?? 0 },
  ];

  return (
    <AdminPageShell
      title="Newsletter"
      subtitle="Everyone who asked to hear from us — the footer signup form plus every new account (creating one subscribes you automatically)."
    >
      {/* Load error */}
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={() => void load(true)}
                className="text-xs font-semibold underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-gray-900 bg-white p-12 flex items-center justify-center gap-2 text-sm text-gray-500 shadow-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading subscribers…
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-gray-900 bg-white p-4 shadow-sm"
              >
                <p className="text-2xl font-bold tabular-nums text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* List */}
          <section>
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-900 shrink-0 flex items-center gap-2">
                <Mail className="w-4 h-4" style={{ color: ACCENT }} />
                Subscribers
              </h2>
              <div className="flex-1 h-px bg-gray-900" />
            </div>

            <div className="rounded-lg border border-gray-900 bg-white overflow-hidden shadow-sm">
              {/* Toolbar */}
              <div className="p-5 border-b border-gray-200 space-y-3">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void load(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-400 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-gray-600 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={filtered.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Excel
                  </button>
                </div>

                {(state?.total ?? 0) > 0 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(0);
                      }}
                      placeholder="Search by email or name…"
                      className="w-full rounded-md border border-gray-400 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30"
                    />
                  </div>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="p-12 text-center text-sm text-gray-500">
                  {(state?.total ?? 0) === 0
                    ? "No one has subscribed yet."
                    : `No subscriber matches "${query.trim()}".`}
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-gray-100">
                    {visible.map((s) => {
                      const name = displayName(s);
                      return (
                        <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                          >
                            {s.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">{s.email}</p>
                            {name && <p className="truncate text-xs text-gray-500">{name}</p>}
                          </div>
                          {s.hasAccount && (
                            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <UserCheck className="h-3 w-3" />
                              Account
                            </span>
                          )}
                          <span className="shrink-0 text-xs tabular-nums text-gray-400">
                            {formatWhen(s.createdAt)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Pagination */}
                  <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
                    <span className="text-xs tabular-nums text-gray-500">
                      {safePage * PAGE_SIZE + 1}–{safePage * PAGE_SIZE + visible.length} of {filtered.length}
                    </span>
                    {pageCount > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPage((p) => Math.max(0, p - 1))}
                          disabled={safePage === 0}
                          className="inline-flex items-center rounded-md border border-gray-400 bg-white p-1.5 text-gray-700 transition-colors hover:border-gray-600 disabled:opacity-40"
                          aria-label="Previous page"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="px-2 text-xs tabular-nums text-gray-500">
                          {safePage + 1} / {pageCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                          disabled={safePage >= pageCount - 1}
                          className="inline-flex items-center rounded-md border border-gray-400 bg-white p-1.5 text-gray-700 transition-colors hover:border-gray-600 disabled:opacity-40"
                          aria-label="Next page"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </AdminPageShell>
  );
};

export default Newsletter;
