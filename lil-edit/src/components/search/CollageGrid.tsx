import product_images from "@/assets/products";

const dummyCollageData = [
  {
    id: 1,
    title: "Festive Collection",
    subtitle: "Up to 40% Off",
    image: product_images["product-0001"]["lil-edit-product-0001-1-6.png"],
    span: "col-span-2 row-span-2",
  },
  {
    id: 2,
    title: "Girls Wear",
    subtitle: "New Arrivals",
    image: product_images["product-0001"]["lil-edit-product-0001-1-7.png"],
    span: "col-span-1 row-span-1",
  },
  {
    id: 3,
    title: "Boys Edit",
    subtitle: "Trending Now",
    image: product_images["product-0001"]["lil-edit-product-0001-1-3.png"],
    span: "col-span-1 row-span-1",
  },
  {
    id: 4,
    title: "Accessories",
    subtitle: "Complete the look",
    image: product_images["product-0001"]["lil-edit-product-0001-1-4.png"],
    span: "col-span-2 md:col-span-1 row-span-1",
  },
];

export default function CollageGrid() {
  return (
    <section className="py-6 px-4 sm:px-6 md:px-8 border-t border-border/50 animate-fade-in" style={{ animationDelay: "100ms" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold tracking-wider text-[#9a65ad] uppercase">
          Discover More
        </h3>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 auto-rows-[120px] md:auto-rows-[150px]">
        {dummyCollageData.map((item) => (
          <button
            key={item.id}
            className={`group relative rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-600/50 ${item.span}`}
          >
            <img
              src={item.image}
              alt={item.title}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            />
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
            
            {/* Text Content */}
            <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col items-start justify-end h-full">
              <span className="text-xs font-semibold tracking-wider text-white/80 uppercase mb-1 drop-shadow-md">
                {item.subtitle}
              </span>
              <h4 className="text-lg md:text-xl font-bold text-white leading-tight drop-shadow-md group-hover:-translate-y-1 transition-transform duration-300">
                {item.title}
              </h4>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
