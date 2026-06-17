import { Package, RotateCcw, Sparkles } from "lucide-react";


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
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl md:text-3xl font-black text-foreground flex items-center gap-3">
            Buy Again
          </h2>
          <button className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-foreground border border-border shadow-sm hover:bg-[#0F766E] hover:text-white transition-all duration-300 shrink-0">
            <RotateCcw className="w-6 h-6" />
          </button>
        </div>
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
