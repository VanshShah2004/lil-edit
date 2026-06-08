import { Package, RotateCcw, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";

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
};

export function SidebarProductCard({ product, onClick }: { product: SidebarProduct; onClick: () => void }) {
  const badges = product.badges ?? [];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="group flex items-center gap-3 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
    >
      <div className="w-16 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            loading="lazy"
            onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <Package size={16} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="font-display text-base font-medium text-gray-900 line-clamp-2 leading-tight">{product.title}</p>
        {/* Badges left-aligned, price right-aligned, on one row. Stays single-line:
            badges never wrap and clip if needed; only the top badge shows on mobile. */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex flex-nowrap items-baseline gap-1.5 min-w-0 overflow-hidden">
            {badges.length > 0 && sortBadges(badges).slice(0, 2).map((tag, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className={`${idx > 0 ? "hidden sm:inline-flex" : ""} bg-gradient-to-r from-purple-50 to-indigo-50 text-indigo-800 border border-indigo-100 text-[10px] leading-none px-2 py-1 whitespace-nowrap rounded-md font-medium shadow-sm`}
              >
                {tag}
              </Badge>
            ))}
          </div>
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-xl font-bold text-brand-teal">{inr(product.price)}</span>
            {product.originalPrice > product.price && (
              <span className="text-base text-gray-400 line-through">{inr(product.originalPrice)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="flex items-center gap-3">
          <div className="w-16 h-20 bg-gray-200 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-full" />
            <div className="h-3 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2 mt-2" />
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
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <RotateCcw className="w-6 h-6 text-brand-teal" />
        Buy Again
      </h2>
      <div className="bg-white border border-gray-400 rounded-2xl p-4 shadow-lg ring-1 ring-black/10 divide-y divide-gray-400">
        {items.map((item) => (
          <SidebarProductCard key={`${item.slug}-${item.sku}`} product={item} onClick={() => onItemClick(item)} />
        ))}
      </div>
    </div>
  );
}

export function YouMayLikeSection({ items, loading, onItemClick }: { items: SidebarProduct[]; loading: boolean; onItemClick: (item: SidebarProduct) => void }) {
  if (!loading && items.length === 0) return null;
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-brand-teal" />
        You May Like
      </h2>
      <div className="bg-white border border-gray-400 rounded-2xl p-4 shadow-lg ring-1 ring-black/10">
        {loading ? (
          <SidebarSkeleton />
        ) : (
          <div className="divide-y divide-gray-400">
            {items.map((item) => (
              <SidebarProductCard key={`${item.slug}-${item.sku}`} product={item} onClick={() => onItemClick(item)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
