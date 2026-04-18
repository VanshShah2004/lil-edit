import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import featured1 from "@/assets/featured-1.jpg";
import featured2 from "@/assets/featured-2.jpg";
import featured3 from "@/assets/featured-3.jpg";

const categories = [
  { name: "Ethnic Elegance", description: "Culture meets Cool", image: featured1, link: "/collections/clothing" },
  { name: "Tiny Accessories", description: "Cute & Shiny", image: featured2, link: "/collections/accessories" },
  { name: "Cozy Essentials", description: "Soft & Snug Comfort", image: featured3, link: "/collections/essentials" },
];

const CategoriesSection = () => (
  <section className="container mx-auto px-4 lg:px-8 py-12 md:py-20">
    <div className="text-center mb-8 md:mb-12">
      <h2 className="font-display text-3xl md:text-4xl text-foreground mb-3">Shop by Category</h2>
      <p className="text-muted-foreground font-body">Find the perfect picks for your little one</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-8">
      {categories.map((cat, i) => (
        <div
          key={i}
          className="group animate-fade-in-up bg-card/40 backdrop-blur-sm rounded-3xl border border-border/50 overflow-hidden shadow-lg shadow-primary/[0.15] ring-2 ring-primary/35"
          style={{ animationDelay: `${i * 0.15}s` }}
        >
          {/* Image Container */}
          <div className="relative overflow-hidden cursor-pointer">
            <img
              src={cat.image}
              alt={cat.name}
              loading="lazy"
              width={640}
              height={500}
              className="w-full h-[240px] sm:h-[260px] md:h-[280px] object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm rounded-full p-2 shadow-md hover:bg-white transition-colors">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
          </div>

          {/* Content Container */}
          <div className="p-5 md:p-6">
            <h3 className="font-display text-xl text-foreground mb-2">{cat.name}</h3>
            <p className="font-body text-sm text-muted-foreground mb-4">{cat.description}</p>
            <Link to={cat.link}>
              <Button className="w-full font-body bg-primary text-primary-foreground border-2 border-primary hover:bg-primary/90 hover:border-primary rounded-full transition-all duration-300 opacity-100 md:opacity-0 md:group-hover:opacity-100 h-10">
                View Collection
              </Button>
            </Link>
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default CategoriesSection;
