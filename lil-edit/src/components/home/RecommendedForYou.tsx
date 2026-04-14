import { ChevronRight, Heart } from "lucide-react";

const RecommendedForYou = () => {
  const products = [
    { name: "Lilac Ruffle Dress", price: "45.00", img: "https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?auto=format&fit=crop&q=80&w=500" },
    { name: "Knitted Bear Sweater", price: "55.00", img: "https://images.unsplash.com/photo-1621072970505-181822de31d7?auto=format&fit=crop&q=80&w=500" },
    { name: "Pastel Romper Set", price: "38.50", img: "https://images.unsplash.com/photo-1560614382-332306fe1d16?auto=format&fit=crop&q=80&w=500" },
    { name: "Cozy Cotton Beanie", price: "18.00", img: "https://images.unsplash.com/photo-1549419139-4d2be7ce24df?auto=format&fit=crop&q=80&w=500" },
    { name: "Soft Sole Booties", price: "24.00", img: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&q=80&w=500" },
  ];

  return (
    <section className="py-12 md:py-14 px-4">
      <div className="container mx-auto">
        <div className="flex justify-between items-end mb-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary/80 mb-2">Curated For You</p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-2">Recommended For You</h2>
            <p className="text-muted-foreground font-body">Based on your recent purchases</p>
          </div>
          <button className="text-primary hover:text-primary/80 font-medium text-sm flex items-center gap-1">
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex overflow-x-auto gap-4 md:gap-6 pb-6 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {products.map((product) => (
            <div key={product.name} className="min-w-[260px] max-w-[260px] snap-start group">
              <div className="relative rounded-2xl overflow-hidden bg-card border border-border mb-3 aspect-[4/5]">
                <img src={product.img} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <button className="absolute top-3 right-3 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-white transition-all shadow-sm">
                  <Heart className="w-4 h-4" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <button className="w-full py-2.5 bg-white/90 backdrop-blur text-foreground rounded-lg font-medium text-sm hover:bg-primary hover:text-white transition-colors shadow-sm">
                    Add to Cart
                  </button>
                </div>
              </div>
              <h3 className="font-display font-medium text-foreground">{product.name}</h3>
              <p className="font-body text-primary">${product.price}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RecommendedForYou;
