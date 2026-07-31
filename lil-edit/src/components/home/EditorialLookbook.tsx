import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ShoppingCart, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

// Importing images from assets
import le1 from "@/assets/searchbar-frequent_searches/le-1.png";
import le2 from "@/assets/searchbar-frequent_searches/le-2.png";
import le3 from "@/assets/searchbar-frequent_searches/le-3.png";
import le4 from "@/assets/searchbar-frequent_searches/le-4.png";
import le5 from "@/assets/searchbar-frequent_searches/le-5.png";
import le6 from "@/assets/searchbar-frequent_searches/le-6.png";
import productImg from "@/assets/products/product-12345/lil-edit-product-1234-1.png";
import productImg2 from "@/assets/products/product-0001/lil-edit-product-0001-1-1.png";

type Hotspot = {
  id: string;
  x: number; // percentage
  y: number; // percentage
  productName: string;
  price: string;
  img: string;
};

type CardData = {
  id: string;
  img: string;
  title?: string;
  badge?: string;
  hotspots?: Hotspot[];
  className: string;
};

const trendingData: CardData[] = [
  {
    id: "hero-1",
    img: le1,
    title: "The Spring Edit",
    badge: "New Arrival",
    className: "col-span-1 md:col-span-2 lg:col-span-8 lg:row-span-2 aspect-square",
    hotspots: [
      {
        id: "hs-1",
        x: 35,
        y: 40,
        productName: "Classic Linen Shirt",
        price: "45.00",
        img: productImg,
      },
      {
        id: "hs-2",
        x: 45,
        y: 70,
        productName: "Denim Overalls",
        price: "60.00",
        img: productImg2,
      },
    ],
  },
  {
    id: "feat-1",
    img: le2,
    badge: "Bestseller",
    className: "col-span-1 md:col-span-1 lg:col-span-4 lg:row-span-1 aspect-square",
    hotspots: [
      {
        id: "hs-3",
        x: 60,
        y: 30,
        productName: "Floral Headband",
        price: "15.00",
        img: productImg,
      },
    ],
  },
  {
    id: "feat-2",
    img: le3,
    badge: "Limited Edition",
    className: "col-span-1 md:col-span-1 lg:col-span-4 lg:row-span-1 aspect-square",
  },
  {
    id: "feat-3",
    img: le4,
    title: "Playdate Ready",
    className: "col-span-1 md:col-span-1 lg:col-span-4 lg:row-span-1 aspect-square",
    hotspots: [
      {
        id: "hs-4",
        x: 50,
        y: 50,
        productName: "Cotton Tee",
        price: "25.00",
        img: productImg2,
      },
    ],
  },
  {
    id: "prod-1",
    img: le5,
    badge: "Summer Drop",
    className: "col-span-1 md:col-span-1 lg:col-span-4 lg:row-span-1 aspect-square bg-[#E5DAF6]",
  },
  {
    id: "prod-2",
    img: le6,
    badge: "Just In",
    className: "col-span-1 md:col-span-2 lg:col-span-4 lg:row-span-1 aspect-square bg-[#E5DAF6]",
  },
];

const ShoppableHotspot = ({ hotspot }: { hotspot: Hotspot }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="absolute z-20"
      style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
      onMouseEnter={() => window.innerWidth >= 1024 && setIsOpen(true)}
      onMouseLeave={() => window.innerWidth >= 1024 && setIsOpen(false)}
    >
      {/* Hotspot Button */}
      <motion.button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm text-gray-900 shadow-lg hover:scale-110 transition-transform"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-40 animate-ping"></span>
        <Plus className={`w-4 h-4 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`} />
      </motion.button>

      {/* Mini Product Card */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="absolute top-10 left-1/2 -translate-x-1/2 w-48 bg-white/80 backdrop-blur-md rounded-2xl shadow-xl overflow-hidden border border-white/50"
          >
            <div className="p-2 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                <img src={hotspot.img} alt={hotspot.productName} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-gray-900 truncate">{hotspot.productName}</h4>
                <p className="text-xs text-gray-600 font-medium">${hotspot.price}</p>
              </div>
            </div>
            <div className="px-2 pb-2">
              <button className="w-full py-1.5 bg-gray-900 text-white text-[10px] uppercase tracking-wider font-bold rounded-lg flex items-center justify-center gap-1.5 hover:bg-teal-700 transition-colors">
                <ShoppingCart className="w-3 h-3" /> Add to Cart
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TrendingCard = ({ card, index }: { card: CardData; index: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: "easeOut" }}
      className={`group relative rounded-[24px] overflow-hidden shadow-sm hover:shadow-xl transition-shadow duration-500 bg-[#EBE2F8] ${card.className}`}
    >
      {/* Background Image */}
      <div className="absolute inset-0 w-full h-full">
        <img
          src={card.img}
          alt={card.title || "Trending item"}
          className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
          loading="lazy"
        />
      </div>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500" />

      {/* Content */}
      <div className="absolute inset-0 p-5 md:p-8 flex flex-col justify-between pointer-events-none">
        <div className="flex justify-between items-start">
          {card.badge && (
            <span className="bg-white/90 backdrop-blur-md text-gray-900 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm">
              {card.badge}
            </span>
          )}
        </div>

        {card.title && (
          <div className="pointer-events-auto transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
            <h3 className="text-white font-display text-2xl md:text-3xl lg:text-4xl font-medium leading-tight mb-3">
              {card.title}
            </h3>
            <Link
              to="/collections"
              className="inline-flex items-center gap-2 text-white text-sm font-semibold uppercase tracking-wider hover:text-teal-300 transition-colors"
            >
              Shop the look <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Shoppable Hotspots */}
      <div className="absolute inset-0 pointer-events-auto">
        {card.hotspots?.map((hotspot) => (
          <ShoppableHotspot key={hotspot.id} hotspot={hotspot} />
        ))}
      </div>
    </motion.div>
  );
};

const EditorialLookbook = () => {
  return (
    <section className="pt-6 md:pt-10 pb-16 md:pb-24 w-full px-4 sm:px-6 lg:px-8">

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 md:gap-5 lg:gap-6">
        {trendingData.map((card, index) => (
          <EditorialCard key={card.id} card={card} index={index} />
        ))}
      </div>

      {/* Mobile View All Button */}
      <div className="mt-8 text-center md:hidden">
        <Link
          to="/shop"
          className="inline-flex items-center gap-2 text-gray-900 font-semibold uppercase tracking-widest text-sm border-b-2 border-gray-900 pb-1 hover:text-teal-600 transition-colors"
        >
          View All Trending <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
};

// Aliasing for compatibility with the component code
const EditorialCard = TrendingCard;

export default EditorialLookbook;
