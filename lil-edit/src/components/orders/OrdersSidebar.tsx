import { Link } from "react-router-dom";
import { Package, Sparkles, Star, MessageSquare, Check } from "lucide-react";
import type { Review } from "@/lib/reviewsApi";


function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// Badge display priority — anything not in this list (e.g. custom badges) sorts first.
const BADGE_PRIORITY = ["newarrival", "trending", "bestseller", "featured"];
function sortBadges(badges: string[]) {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return [...badges].sort((a, b) => {
    const ai = BADGE_PRIORITY.findIndex((p) => norm(a).includes(p));
    const bi = BADGE_PRIORITY.findIndex((p) => norm(b).includes(p));
    return (ai === -1 ? -1 : ai) - (bi === -1 ? -1 : bi);
  });
}

export type SidebarProduct = {
  title: string;
  slug: string;
  categorySlug: string;
  price: number;
  originalPrice: number;
  image: string;
  sku: string;
  badges?: string[];
  // Carried from order snapshots (Buy Again). null = product deleted; undefined
  // for live recommendations, which are always navigable.
  productId?: string | null;
};

function SidebarSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:flex md:gap-5 animate-pulse">
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className={`bg-card rounded-2xl border border-border p-2 md:p-1.5 shrink-0 w-full md:w-[calc(20%-16px)] ${n > 4 ? "hidden md:block" : ""}`}>
          <div className="w-full aspect-[3/4] md:aspect-[4/5] bg-gray-200 rounded-xl mb-2 md:mb-1.5" />
          <div className="px-1 space-y-1.5">
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BuyAgainSection({ items, onItemClick }: { items: SidebarProduct[]; onItemClick: (item: SidebarProduct) => void }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-3 md:mb-4">
        <p className="text-base font-black tracking-[0.2em] uppercase text-[#0F766E] mb-0.5">Loved It Once?</p>
        <h2 className="font-display text-2xl md:text-3xl font-black text-foreground flex items-center gap-3">
          Buy Again
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 md:flex md:gap-5 md:overflow-x-auto md:no-scrollbar md:snap-x md:snap-mandatory md:scroll-smooth pb-2" style={{ scrollbarWidth: "none" }}>
        {items.map((item, idx) => (
          <div
            key={`${item.slug}-${item.sku}`}
            onClick={() => onItemClick(item)}
            className={`group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all shrink-0 md:snap-start w-full md:w-[calc(20%-16px)] cursor-pointer ${idx >= 4 ? "hidden md:block" : ""}`}
          >
            <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
              {item.image ? (
                <img src={item.image} alt={item.title} loading="lazy" onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-100"><Package size={24} /></div>
              )}
              {(item.badges ?? []).length > 0 && (
                <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 text-[#0F766E] shadow-sm">
                  {sortBadges(item.badges!)[0]}
                </span>
              )}
            </div>
            <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
              <h3 className="font-display text-xs md:text-sm font-medium text-foreground leading-snug line-clamp-2">{item.title}</h3>
              <p className="font-body text-xs font-semibold text-[#0F766E] shrink-0">{inr(item.price)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function YouMayLikeSection({ items, loading, onItemClick }: { items: SidebarProduct[]; loading: boolean; onItemClick: (item: SidebarProduct) => void }) {
  if (!loading && items.length === 0) return null;
  return (
    <div>
      <div className="mb-3 md:mb-4">
        <p className="text-base font-black tracking-[0.2em] uppercase text-[#0F766E] mb-0.5">Just For You</p>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground flex items-center gap-3">
            You May Like
          </h2>
          <button className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-foreground border border-border shadow-sm hover:bg-[#0F766E] hover:text-white transition-all duration-300 shrink-0">
            <Sparkles className="w-6 h-6" />
          </button>
        </div>
      </div>
      {loading ? (
        <SidebarSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:flex md:gap-5 md:overflow-x-auto md:no-scrollbar md:snap-x md:snap-mandatory md:scroll-smooth pb-2" style={{ scrollbarWidth: "none" }}>
          {items.map((item, idx) => (
            <div
              key={`${item.slug}-${item.sku}`}
              onClick={() => onItemClick(item)}
              className={`group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all shrink-0 md:snap-start w-full md:w-[calc(20%-16px)] cursor-pointer ${idx >= 4 ? "hidden md:block" : ""}`}
            >
              <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                {item.image ? (
                  <img src={item.image} alt={item.title} loading="lazy" onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-100"><Package size={24} /></div>
                )}
                {(item.badges ?? []).length > 0 && (
                  <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 text-[#0F766E] shadow-sm">
                    {sortBadges(item.badges!)[0]}
                  </span>
                )}
              </div>
              <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                <h3 className="font-display text-xs md:text-sm font-medium text-foreground leading-snug line-clamp-2">{item.title}</h3>
                <p className="font-body text-xs font-semibold text-[#0F766E] shrink-0">{inr(item.price)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReviewHistorySection({
  reviews,
  loading,
  pendingItems = [],
  productInfoBySlug,
}: {
  reviews: Review[];
  loading: boolean;
  pendingItems?: { item: SidebarProduct; orderId: string }[];
  productInfoBySlug?: Map<string, { title: string; image: string }>;
}) {
  const total = reviews.length + pendingItems.length;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-400 shadow-lg ring-1 ring-black/10 overflow-hidden p-6">
        <div className="flex justify-center">
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-brand-teal/30 shadow-xl ring-1 ring-brand-teal/10 overflow-hidden">
      {/* Accent strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-brand-teal via-teal-500 to-emerald-400" />

      {/* Header — tinted band so the panel reads as its own surface */}
      <div className="p-4 sm:p-6 bg-gradient-to-br from-brand-teal/10 to-emerald-50 border-b border-brand-teal/15">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-teal text-white shadow-sm shrink-0">
            <MessageSquare className="w-5 h-5" />
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Your Reviews</h2>
          {total > 0 && (
            <span className="ml-auto text-xs font-bold text-brand-teal bg-white border border-brand-teal/30 rounded-full px-2.5 py-1 shadow-sm">
              {total}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-1.5">Spill the tea, rate the fit, explore the cuteness ✨</p>
      </div>

      {/* Product Cards */}
      <div className="p-4 sm:p-6 bg-white space-y-6">
        {/* Pending — not reviewed yet */}
        {pendingItems.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900">Pending Reviews</h3>
        {pendingItems.map(({ item, orderId }) => (
          <Link
            key={`${item.slug}-${item.sku}`}
            to={`/orders/${orderId}`}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50 shadow-sm text-left"
          >
            {/* Product Image */}
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <MessageSquare size={20} />
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">{item.title}</p>
              <p className="text-xs text-gray-500">Not reviewed yet</p>
            </div>

            {/* Action Button */}
            <div className="shrink-0">
              <div className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-teal">
                Write Review
              </div>
            </div>
          </Link>
        ))}
        </div>
        )}

        {/* Reviewed */}
        {reviews.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900">Reviewed Products</h3>
        {reviews.map((review) => {
          const info = productInfoBySlug?.get(review.productSlug);
          const displayTitle = info?.title ?? review.productSlug.replace(/-/g, " ");
          const displayImage = info?.image ?? review.images?.[0];
          return (
          <div
            key={review.id}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50 shadow-sm text-left"
          >
            {/* Product Image */}
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={displayTitle}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <MessageSquare size={20} />
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">{displayTitle}</p>

              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-3.5 h-3.5 ${
                        star <= review.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                {review.verified && (
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    Verified
                  </span>
                )}
              </div>
            </div>

            {/* Action Button */}
            <div className="shrink-0">
              <div className="px-3 py-1.5 rounded-lg text-sm font-medium text-brand-teal border border-brand-teal/30 bg-brand-teal/5">
                Edit Review
              </div>
            </div>
          </div>
          );
        })}
        </div>
        )}
      </div>
    </div>
  );
}
