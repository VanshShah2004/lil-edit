import featured1 from "@/assets/featured-1.jpg";
import featured2 from "@/assets/featured-2.jpg";
import featured3 from "@/assets/featured-3.jpg";

const categories = [
  { name: "Clothing", description: "Soft & snuggly outfits", image: featured1 },
  { name: "Accessories", description: "Tiny shoes, bows & more", image: featured2 },
  { name: "Essentials", description: "Blankets & comfort", image: featured3 },
];

const CategoriesSection = () => (
  <section className="container mx-auto px-4 lg:px-8 py-20">
    <div className="text-center mb-12">
      <h2 className="font-display text-3xl md:text-4xl text-foreground mb-3">Shop by Category</h2>
      <p className="text-muted-foreground font-body">Find the perfect picks for your little one</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {categories.map((cat, i) => (
        <div
          key={cat.name}
          className="group relative rounded-2xl overflow-hidden cursor-pointer animate-fade-in-up"
          style={{ animationDelay: `${i * 0.15}s` }}
        >
          <img
            src={cat.image}
            alt={cat.name}
            loading="lazy"
            width={640}
            height={800}
            className="w-full h-[400px] object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/50 to-transparent" />
          <div className="absolute bottom-6 left-6">
            <h3 className="font-display text-2xl text-primary-foreground mb-1">{cat.name}</h3>
            <p className="font-body text-sm text-primary-foreground/80">{cat.description}</p>
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default CategoriesSection;
