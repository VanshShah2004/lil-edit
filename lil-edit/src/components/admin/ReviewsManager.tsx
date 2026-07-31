import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowDownUp,
  BadgeCheck,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldOff,
  Star,
  Trash2,
} from "lucide-react";

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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  fetchAllReviews,
  setReviewVerified,
  deleteAdminReview,
  type AdminReview,
} from "@/lib/adminReviewsApi";
import ReviewFilterSlider, { type ReviewFilter } from "@/components/admin/ReviewFilterSlider";

const ACCENT = "#B19CD9";

type Filter = ReviewFilter;
type Sort = "newest" | "oldest" | "rating_high" | "rating_low";

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "rating_high", label: "Highest rating" },
  { value: "rating_low", label: "Lowest rating" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const ReviewsManager = () => {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");

  const [viewAll, setViewAll] = useState(false);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminReview | null>(null);
  const [deleting, setDeleting] = useState(false);

  const PREVIEW_COUNT = 5;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchAllReviews();
      setReviews(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load reviews.";
      setLoadError(msg);
      console.error("[ReviewsManager] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sortComparator = useCallback(
    (a: AdminReview, b: AdminReview) => {
      switch (sort) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "rating_high":
          return b.rating - a.rating;
        case "rating_low":
          return a.rating - b.rating;
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    },
    [sort],
  );

  // Full filtered + sorted list — drives the "View all" modal.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reviews
      .filter((r) => {
        if (filter === "verified" && !r.verified) return false;
        if (filter === "unverified" && r.verified) return false;
        if (!q) return true;
        return (
          r.productSlug.toLowerCase().includes(q) ||
          r.userName.toLowerCase().includes(q) ||
          r.comment.toLowerCase().includes(q)
        );
      })
      .sort(sortComparator);
  }, [reviews, query, filter, sortComparator]);

  // Inline preview — top N by the chosen sort, no search/filter applied.
  const preview = useMemo(
    () => [...reviews].sort(sortComparator).slice(0, PREVIEW_COUNT),
    [reviews, sortComparator],
  );

  const handleToggleVerify = async (review: AdminReview) => {
    setVerifyingId(review.id);
    try {
      const updated = await setReviewVerified(review.id, !review.verified);
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(updated.verified ? "Review marked as verified." : "Review marked as unverified.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update review.");
    } finally {
      setVerifyingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAdminReview(deleteTarget.id);
      setReviews((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success("Review deleted.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete review.");
    } finally {
      setDeleting(false);
    }
  };

  const renderRow = (review: AdminReview) => (
    <li key={review.id} className="flex items-start gap-3 sm:gap-4 px-5 py-4">
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
      >
        {initials(review.userName)}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Line 1: name · stars · status */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-gray-900">{review.userName}</span>
          <span className="inline-flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
              />
            ))}
          </span>
          {review.verified ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-100 text-[10px] font-bold uppercase tracking-wide text-green-700">
              <BadgeCheck className="w-3 h-3" /> Verified
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-md bg-gray-200 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Unverified
            </span>
          )}
        </div>

        {/* Line 2: product · date */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-gray-500">
          <span className="font-mono break-all">{review.productSlug}{review.sku ? ` · ${review.sku}` : ""}</span>
          <span className="text-gray-300">•</span>
          <span className="whitespace-nowrap">{formatDate(review.createdAt)}</span>
        </div>

        {/* Line 3: comment */}
        <p className="text-xs text-gray-700 mt-2 break-words leading-relaxed">{review.comment}</p>
      </div>

      {/* Actions — anchored top-right, aligned with the name line */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => void handleToggleVerify(review)}
          disabled={verifyingId === review.id}
          title={review.verified ? "Mark as unverified" : "Mark as verified"}
          className={`inline-flex items-center justify-center rounded-md border w-8 h-8 transition-colors disabled:opacity-50 ${
            review.verified
              ? "border-green-600 bg-green-600 text-white hover:bg-green-700"
              : "border-gray-400 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {verifyingId === review.id ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : review.verified ? (
            <BadgeCheck className="w-3.5 h-3.5" />
          ) : (
            <ShieldOff className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setDeleteTarget(review)}
          title="Delete review"
          className="inline-flex items-center justify-center rounded-md border border-gray-400 w-8 h-8 text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-500" />
        </button>
      </div>
    </li>
  );

  const loadErrorBlock = loadError && (
    <div className="p-5 bg-red-50">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800">Couldn't load reviews</p>
          <p className="text-xs text-red-700 mt-1 break-words">{loadError}</p>
          <button
            type="button"
            onClick={() => { setLoading(true); void load(); }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <section>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-900 shrink-0 flex items-center gap-2">
          <MessageSquareText className="w-4 h-4" style={{ color: ACCENT }} />
          Review Management
        </h2>
        <div className="flex-1 h-px bg-gray-900" />
      </div>

      <div className="rounded-lg border border-gray-900 bg-white overflow-hidden shadow-sm">

        {/* Header — count. The invisible placeholder button matches the height of the
            Coupons header (which has a "New coupon" button) so the two sections align. */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-700">
            Reviews{!loading && !loadError ? ` (${reviews.length})` : ""}
          </p>
          <span aria-hidden className="invisible inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold">
            New coupon
          </span>
        </div>

        {loadErrorBlock}

        {/* Loading */}
        {loading && !loadError && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !loadError && reviews.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <MessageSquareText className="w-8 h-8 text-gray-400 mb-3" />
            <p className="text-sm font-semibold text-gray-700">No reviews yet</p>
            <p className="text-xs text-gray-500 mt-1">No reviews have been submitted yet.</p>
          </div>
        )}

        {/* Inline preview — top 5 by sort */}
        {!loading && !loadError && reviews.length > 0 && (
          <>
            <ul className="divide-y divide-gray-400">
              {preview.map(renderRow)}
            </ul>
            {reviews.length > PREVIEW_COUNT && (
              <div className="flex justify-center px-5 py-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setViewAll(true)}
                  className="inline-flex items-center justify-center rounded-md bg-teal-600 px-20 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
                >
                  View all
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* View-all sheet — slides up from the bottom; full search + filter + sort + list */}
      <Sheet open={viewAll} onOpenChange={setViewAll}>
        <SheetContent
          side="bottom"
          overlayClassName="bg-black/40"
          className="p-0 gap-0 rounded-t-xl flex flex-col w-full overflow-x-hidden h-[calc(100vh-var(--navbar-height))] max-h-[calc(100vh-var(--navbar-height))]"
        >
          <SheetHeader className="px-5 py-4 border-b border-gray-200 text-left space-y-0">
            <SheetTitle className="text-sm font-bold uppercase tracking-[0.18em] text-gray-900 flex items-center gap-2">
              <MessageSquareText className="w-4 h-4" style={{ color: ACCENT }} />
              All Reviews ({filtered.length})
            </SheetTitle>
          </SheetHeader>

          {/* Toolbar — search (left) · filter slider (center) · sort (right) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 border-b border-gray-200">
            <div className="relative sm:flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search reviews…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-md border border-gray-400 pl-8 pr-3 py-1.5 text-xs text-gray-900 outline-none transition-colors focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30"
              />
            </div>
            <ReviewFilterSlider value={filter} onChange={setFilter} className="w-full sm:w-56 h-9 shrink-0" />
            <div className="flex justify-end sm:flex-1">
              <div className="relative shrink-0">
                <ArrowDownUp className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="rounded-md border border-gray-400 pl-7 pr-3 py-1.5 text-xs font-semibold text-gray-700 outline-none transition-colors focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 appearance-none bg-white cursor-pointer"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <MessageSquareText className="w-8 h-8 text-gray-400 mb-3" />
                <p className="text-sm font-semibold text-gray-700">No reviews found</p>
                <p className="text-xs text-gray-500 mt-1">Try a different search or filter.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-400">
                {filtered.map(renderRow)}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete review?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete this review by{" "}
              <span className="font-semibold">{deleteTarget?.userName}</span> on{" "}
              <span className="font-semibold font-mono">{deleteTarget?.productSlug}</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Deleting…
                </span>
              ) : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default ReviewsManager;
