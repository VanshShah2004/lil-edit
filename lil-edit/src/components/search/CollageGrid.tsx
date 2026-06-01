import product_images from "@/assets/products";
import img1 from "@/assets/searchbar-frequent_searches/le-1.png";
import img2 from "@/assets/searchbar-frequent_searches/le-2.png";
import img3 from "@/assets/searchbar-frequent_searches/le-3.png";
import img4 from "@/assets/searchbar-frequent_searches/le-4.png";
import img5 from "@/assets/searchbar-frequent_searches/le-5.png";
import img6 from "@/assets/searchbar-frequent_searches/le-6.png";

const dummyCollageData = [
  { id: 1, title: "Festive", subtitle: "Top Picks", image: img1, span: "col-span-1 row-span-2" },
  { id: 2, title: "Trendy", subtitle: "New In", image: img2, span: "col-span-1 row-span-1" },
  { id: 3, title: "Boys", subtitle: "Must Haves", image: img3, span: "col-span-1 row-span-2" },
  { id: 4, title: "Girls", subtitle: "Collections", image: img4, span: "col-span-1 row-span-3" },
  { id: 5, title: "Winter", subtitle: "Warm", image: img5, span: "col-span-1 row-span-1" },
  { id: 6, title: "Summer", subtitle: "Cool", image: img6, span: "col-span-1 row-span-1" },
  { id: 7, title: "Party", subtitle: "Dresses", image: product_images["product-0001"]["lil-edit-product-0001-1-6.png"], span: "col-span-1 row-span-2" },
  { id: 8, title: "Casual", subtitle: "Everyday", image: product_images["product-0001"]["lil-edit-product-0001-1-7.png"], span: "col-span-1 row-span-2" },
  { id: 9, title: "Shoes", subtitle: "Step Up", image: product_images["product-0001"]["lil-edit-product-0001-1-4.png"], span: "col-span-1 row-span-1" },
];

export default function CollageGrid() {
  return (
    <section className="pt-2 pb-3 px-4 sm:px-6 md:px-8 border-t border-border/50 animate-fade-in" style={{ animationDelay: "100ms" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold tracking-wider text-teal-700 uppercase">
          Discover More
        </h3>
      </div>
      
      <div className="grid grid-cols-3 gap-2 sm:gap-3 auto-rows-[60px] sm:auto-rows-[80px] md:auto-rows-[110px]">
        {dummyCollageData.map((item) => (
          <button
            key={item.id}
            className={`group relative rounded-xl sm:rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-600/50 ${item.span}`}
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
              <span className="text-[10px] sm:text-xs font-semibold tracking-wider text-white/90 uppercase mb-0.5 sm:mb-1 drop-shadow-md">
                {item.subtitle}
              </span>
              <h4 className="text-sm sm:text-lg md:text-xl font-bold text-white leading-tight drop-shadow-md group-hover:-translate-y-1 transition-transform duration-300">
                {item.title}
              </h4>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
