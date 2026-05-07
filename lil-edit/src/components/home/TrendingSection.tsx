import { Heart } from "lucide-react";
import le0 from "@/assets/searchbar-frequent_searches/le-0.png";
import le1 from "@/assets/searchbar-frequent_searches/le-1.png";
import le2 from "@/assets/searchbar-frequent_searches/le-2.png";
import le3 from "@/assets/searchbar-frequent_searches/le-3.png";
import le4 from "@/assets/searchbar-frequent_searches/le-4.png";
import le5 from "@/assets/searchbar-frequent_searches/le-5.png";
import le6 from "@/assets/searchbar-frequent_searches/le-6.png";
import feat1 from "@/assets/featured-1.jpg";
import feat2 from "@/assets/featured-2.jpg";
import feat3 from "@/assets/featured-3.jpg";

const TrendingSection = () => {
  const products = [
    { name: "Floral Summer Dress", price: "42.00", img: le0, badge: "Bestseller" },
    { name: "Linen Overall Shorts", price: "36.00", img: le1, badge: "Trending" },
    { name: "Ribbed Knit Cardigan", price: "50.00", img: le2 },
    { name: "Classic Denim Jacket", price: "48.00", img: le3, badge: "Trending" },
    { name: "Pastel Cotton Romper", price: "38.00", img: le4, badge: "New" },
    { name: "Embroidered Tunic Top", price: "44.00", img: le5 },
    { name: "Velvet Party Dress", price: "55.00", img: le6, badge: "Bestseller" },
    { name: "Striped Dungarees", price: "40.00", img: feat1 },
    { name: "Boho Maxi Skirt", price: "46.00", img: feat2, badge: "Trending" },
    { name: "Ruffled Blouse Set", price: "52.00", img: feat3, badge: "New" },
  ];

  return (
    <section className="-mt-2 md:-mt-3 pt-0 pb-12 md:pt-1 md:pb-14 px-0">
      <div className="container">
        <div className="flex items-end justify-between mb-6 md:mb-8">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-foreground">Trending Now</h2>
          </div>
        </div>
        {/* Horizontal scroll: 2 visible on mobile, 5 on desktop */}
        <div
          className="flex gap-4 md:gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {products.map((product) => (
            <div
              key={product.name}
              className="group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all shrink-0 snap-start w-[calc(50%-8px)] md:w-[calc(20%-16px)]"
            >
              <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                {product.badge && (
                  <div className="absolute top-2 left-2 z-10 bg-primary/90 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md backdrop-blur shadow-sm">
                    {product.badge}
                  </div>
                )}
                <img src={product.img} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <button className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-all">
                  <Heart className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-1 pb-0.5">
                <h3 className="font-display text-xs md:text-sm font-medium text-foreground truncate">{product.name}</h3>
                <p className="font-body text-xs text-primary mt-0.5">${product.price}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrendingSection;
