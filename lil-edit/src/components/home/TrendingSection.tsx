import { Heart } from "lucide-react";

const TrendingSection = () => {
  const products = [
    { name: "Floral Summer Dress", price: "42.00", img: "https://images.unsplash.com/photo-1622290319146-7b63df48a635?auto=format&fit=crop&q=80&w=500", badge: "Bestseller" },
    { name: "Linen Overall Shorts", price: "36.00", img: "https://images.unsplash.com/photo-1544645239-0113c126511a?auto=format&fit=crop&q=80&w=500", badge: "Trending" },
    { name: "Ribbed Knit Cardigan", price: "50.00", img: "https://images.unsplash.com/photo-1596870230751-ebdfce98ec42?auto=format&fit=crop&q=80&w=500" },
    { name: "Classic Denim Jacket", price: "48.00", img: "https://images.unsplash.com/photo-1519238392176-7f41a868516d?auto=format&fit=crop&q=80&w=500", badge: "Trending" },
  ];

  return (
    <section className="py-12 md:py-14 px-0">
      <div className="container">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary/80 mb-2">Latest Picks</p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground">Trending Now</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {products.map((product) => (
            <div key={product.name} className="group bg-card p-3 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <div className="relative rounded-xl overflow-hidden aspect-[4/5] mb-3">
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
              <div className="px-1 pb-1">
                <h3 className="font-display text-sm md:text-base font-medium text-foreground truncate">{product.name}</h3>
                <p className="font-body text-sm text-primary mt-1">${product.price}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrendingSection;
