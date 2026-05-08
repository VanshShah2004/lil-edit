import { ArrowRight, Heart } from "lucide-react";
import le0 from "@/assets/searchbar-frequent_searches/le-0.png";
import le1 from "@/assets/searchbar-frequent_searches/le-1.png";
import le2 from "@/assets/searchbar-frequent_searches/le-2.png";
import le3 from "@/assets/searchbar-frequent_searches/le-3.png";
import le4 from "@/assets/searchbar-frequent_searches/le-4.png";
import le5 from "@/assets/searchbar-frequent_searches/le-5.png";
import le6 from "@/assets/searchbar-frequent_searches/le-6.png";
import feat1 from "@/assets/featured-1.jpg";

const RecommendedForYou = () => {
  const products = [
    { name: "Lilac Ruffle Dress", price: "4500", img: le4 },
    { name: "Knitted Bear Sweater", price: "5500", img: le5 },
    { name: "Pastel Romper Set", price: "3850", img: le6 },
    { name: "Cozy Cotton Beanie", price: "1800", img: le2 },
    { name: "Soft Sole Booties", price: "2400", img: le3 },
    { name: "Halter Top Set", price: "4200", img: le0 },
    { name: "Yellow Jumpsuit", price: "3600", img: le1 },
    { name: "Embroidered Tunic", price: "4400", img: le5 },
    { name: "Velvet Party Dress", price: "5500", img: le6 },
    { name: "Striped Dungarees", price: "4000", img: feat1 },
  ];

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
            <button className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary text-foreground hover:bg-[#0F766E] hover:text-white transition-all duration-300 shrink-0">
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Mobile: 2x2 Grid (4 items) | Desktop: Horizontal scroll */}
        <div 
          className="grid grid-cols-2 gap-4 md:flex md:gap-5 md:overflow-x-auto md:no-scrollbar md:snap-x md:snap-mandatory md:scroll-smooth pb-2" 
          style={{ scrollbarWidth: "none" }}
        >
          {products.map((product, idx) => (
            <div 
              key={product.name} 
              className={`group bg-card p-2 md:p-1.5 rounded-2xl shadow-sm border border-border hover:shadow-lg hover:-translate-y-0.5 transition-all shrink-0 md:snap-start w-full md:w-[calc(20%-16px)] ${idx >= 4 ? 'hidden md:block' : ''}`}
            >
              <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-[4/5] mb-2 md:mb-1.5">
                <img src={product.img} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <button className="absolute top-2 right-2 w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-all">
                  <Heart className="w-3.5 h-3.5" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <button className="w-full py-1.5 bg-white/90 backdrop-blur text-foreground rounded-lg font-medium text-[10px] md:text-xs hover:bg-[#0F766E] hover:text-white transition-colors shadow-sm">
                    Add to Cart
                  </button>
                </div>
              </div>
              <div className="px-1 pb-0.5 flex justify-between items-start gap-2">
                <h3 className="font-display text-xs md:text-sm font-medium text-foreground leading-snug">{product.name}</h3>
                <p className="font-body text-xs font-semibold text-[#0F766E] shrink-0">₹{product.price}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RecommendedForYou;
