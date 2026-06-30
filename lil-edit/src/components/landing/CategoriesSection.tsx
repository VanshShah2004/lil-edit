import featured1 from "@/assets/featured-1.jpg";
import featured2 from "@/assets/featured-2.jpg";
import featured3 from "@/assets/featured-3.jpg";

const categories = [
  { name: "Ethnic Elegance", description: "Culture meets Cool", image: featured1, link: "/collections/clothing" },
  { name: "Tiny Accessories", description: "Cute & Shiny", image: featured2, link: "/collections/accessories" },
  { name: "Cozy Essentials", description: "Soft & Snug Comfort", image: featured3, link: "/collections/essentials" },
];

const CategoriesSection = () => (
  <section className="w-full bg-[#E9DFF5] border-y border-[#DCD0EB]/50 py-12 md:py-20">
    <div className="page-container">
      <div className="text-center mb-8 md:mb-12">
        <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-3">Shop by Category</h2>
        <p className="text-muted-foreground font-body">Find the perfect picks for your little one</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-8">
        {categories.map((cat, i) => (
          <div
            key={i}
            className="group animate-fade-in-up flex flex-col"
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            {/* Image Container */}
            <div className="relative overflow-hidden rounded-t-3xl">
              <img
                src={cat.image}
                alt={cat.name}
                loading="lazy"
                width={640}
                height={500}
                className="w-full h-[180px] sm:h-[200px] md:h-[220px] object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>

            {/* Content Container */}
            <div className="p-4 md:p-5 bg-white border-[1.25px] border-t-0 border-gray-500 shadow-lg rounded-b-3xl">
              <h3 className="font-display text-xl text-foreground mb-1">{cat.name}</h3>
              <p className="font-body text-sm text-muted-foreground">{cat.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default CategoriesSection;
