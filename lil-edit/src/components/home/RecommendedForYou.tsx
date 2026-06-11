import { ArrowRight, Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCuratedSection, pdpUrlFor } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedProductItem } from "@/lib/curationApi";

interface Card {
  key: string;
  name: string;
  price: string;
  img: string;
  // Set only for real curated products → enables PDP navigation + wishlist.
  product?: ResolvedProductItem;
}

const RecommendedForYou = ({ previewItems }: { previewItems?: ResolvedItem[] }) => {
  const preview = previewItems !== undefined;
  const navigate = useNavigate();
  const { isWishlisted, addToWishlist, removeFromWishlist, wishlistItems } = useWishlist();
  const { products: fetchedProducts } = useCuratedSection("home_recommended", { skip: preview });
  const products = preview
    ? previewItems.filter((i): i is ResolvedProductItem => i.kind === "product")
    : fetchedProducts;

  const curated: Card[] = products.map((p) => ({
    key: p.id,
    name: p.title,
    price: String(p.price),
    img: p.image ?? "",
    product: p,
  }));
  // No local mock fill for product sections: the backend already tops product
  // sections up with real catalog items, so empty here means curation is
  // unavailable — hide the strip rather than show placeholder products.
  const cards = curated;

  const toggleWishlist = (p: ResolvedProductItem) => {
    const existing = wishlistItems.find((i) => i.slug === p.slug && i.sku === p.sku);
    if (existing) void removeFromWishlist(existing.id);
    else void addToWishlist(p.slug, p.sku);
  };

  if (cards.length === 0) {
    console.log("[RecommendedForYou] no products — section hidden");
    return null;
  }

  return (
    <section className="-mt-14 md:-mt-18 pt-0 pb-6 md:pt-1 md:pb-8 px-0">
      <div className="container">
        <div className="mb-3 md:mb-4">
          <p className="text-base font-black tracking-[0.2em] uppercase text-[#0F766E] mb-0.5 pt-12">
            Curated For You
          </p>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl md:text-3xl font-black text-foreground flex items-center gap-3">
              Recommended For You
            </h2>
            <button className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-foreground border border-border shadow-sm hover:bg-[#0F766E] hover:text-white transition-all duration-300 shrink-0">
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Mobile: 2x2 Grid (4 items) | Desktop: Horizontal scroll */}
        <div
          className="grid grid-cols-2 gap-4 md:flex md:gap-5 md:overflow-x-auto md:no-scrollbar md:snap-x md:snap-mandatory md:scroll-smooth pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {cards.map((card, idx) => {
            const p = card.product;
            const wishlisted = p ? isWishlisted(p.slug, p.sku) : false;
            return (
              <div
                key={card.key}
                onClick={p ? () => navigate(pdpUrlFor(p)) : undefined}
                className={`group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all shrink-0 md:snap-start w-full md:w-[calc(20%-16px)] ${idx >= 4 ? 'hidden md:block' : ''} ${p ? 'cursor-pointer' : ''}`}
              >
                <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                  <img src={card.img} alt={card.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <button
                    onClick={p ? (e) => { e.stopPropagation(); toggleWishlist(p); } : undefined}
                    className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-all"
                    aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
                  >
                    <Heart className="w-3.5 h-3.5" fill={wishlisted ? "currentColor" : "none"} />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                    <button
                      onClick={p ? (e) => { e.stopPropagation(); navigate(pdpUrlFor(p)); } : undefined}
                      className="w-full py-1.5 bg-white/90 backdrop-blur text-foreground rounded-lg font-medium text-[10px] md:text-xs hover:bg-[#0F766E] hover:text-white transition-colors shadow-sm"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
                <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                  <h3 className="font-display text-xs md:text-sm font-medium text-foreground leading-snug">{card.name}</h3>
                  <p className="font-body text-xs font-semibold text-[#0F766E] shrink-0">₹{card.price}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default RecommendedForYou;
