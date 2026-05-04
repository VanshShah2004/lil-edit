import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const megaMenuItems = [
  "NEW ARRIVALS",
  "GIRLS",
  "BOYS",
  "TRENDING",
  "BY OCCASSION",
];

const megaMenuContent: Record<
  string,
  { title: string; links: string[] }[]
> = {
  "NEW ARRIVALS": [
    { title: "JUST IN", links: ["All", "Daily New", "Ready To Ship", "Bestsellers", "Latest Sets"] },
    { title: "TRENDING", links: ["Ethnic Wear", "Western Wear", "Fusion Looks", "Party Wear", "Lookbook"] },
    { title: "SHOP BY AGE", links: ["0-2 Years", "2-4 Years", "4-6 Years", "6-8 Years", "8+ Years"] },
    { title: "MORE", links: ["Accessories", "Shoes", "Bags", "Hair Essentials", "Stationery"] },
  ],
  "GIRLS": [
    { title: "ETHNIC WEAR", links: ["All", "Lehengas", "Kurtis", "Shararas", "Sarees", "Sets"] },
    { title: "TRENDING", links: ["New Arrivals", "Ready To Ship", "Wedding", "Reels", "Lookbook"] },
    { title: "DRESSES & SETS", links: ["All", "Dresses", "Gowns", "Jumpsuits", "Co-ords", "Party Looks"] },
    { title: "MORE", links: ["Hair Accessories", "Sleepwear", "Shoes", "Bags", "Jewellery", "Other Apparel"] },
  ],
  "BOYS": [
    { title: "◈ CLASSIC ETHNIC", links: ["All", "Kurta Pajama", "Kurta Dhoti", "Pathani", "Angarakha "] },
    { title: "✧ ROYAL VIBES", links: ["Sherwani", "Indo-Western", "Bandhgala Sets", "Nawabi Sets"] },
    { title: "⟡ COOL & TRENDY", links: ["Co-ord Sets", "Printed Shirts", "Smart Casuals", "Mini Mahrajas"] },
    { title: "❖ THE LIL GENTLEMEN", links: ["Shirts & Suspenders", "Blazers", "Waistcoat Sets", "Tuxedos"] },
  ],
  "TRENDING": [
    { title: "HOT RIGHT NOW", links: ["Instagram Reels", "Celebrity Picks", "Top Rated", "Festive Edits", "Wedding Edit"] },
    { title: "SEASONAL", links: ["Summer Picks", "Monsoon Ready", "Winter Layers", "Spring Colors"] },
    { title: "SHOP BY LOOK", links: ["Traditional", "Modern Ethnic", "Streetwear", "Elegant", "Minimal"] },
    { title: "THEME-BASED", links: ["Super-hero Edit", "Safari Style", "Space Explorer"] },
  ],
  "BY OCCASSION": [
    { title: "EVENTS", links: ["Birthday", "Wedding", "Festive", "School Events", "Family Function"] },
    { title: "STYLE TYPE", links: ["Traditional", "Contemporary", "Comfort Wear", "Party Wear", "Premium Edit"] },
    { title: "SHOP FAST", links: ["Ready To Ship", "Under 1999", "Matching Siblings", "Quick Picks"] },
    { title: "DISCOVER", links: ["Top Collections", "Gift Sets", "Accessories", "New In"] },
  ],
};

const MegaMenu = () => {
  const [activeMegaTab, setActiveMegaTab] = useState<string | null>(null);
  const megaMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!megaMenuRef.current) return;
      if (!megaMenuRef.current.contains(event.target as Node)) {
        setActiveMegaTab(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, []);

  return (
    <div
      ref={megaMenuRef}
      className="border-t border-border/60 bg-background w-full"
      onMouseLeave={() => window.innerWidth >= 768 && setActiveMegaTab(null)}
    >
      <div className="container mx-auto px-1 sm:px-4 lg:px-8 py-3.5 md:py-1.5 lg:py-2">
        <div className="flex items-center justify-center whitespace-nowrap overflow-hidden pb-1">
          {megaMenuItems.map((item, index) => (
            <div key={`unified-${item}`} className="flex items-center">
              <button
                type="button"
                onMouseEnter={() => window.innerWidth >= 768 && setActiveMegaTab(item)}
                onClick={() => setActiveMegaTab((prev) => (prev === item ? null : item))}
                className={`px-[1.2vw] min-[450px]:px-2 sm:px-3 lg:px-4 py-1 text-[2.65vw] min-[450px]:text-[12px] sm:text-xs md:text-sm lg:text-base font-bold tracking-tighter min-[450px]:tracking-tight sm:tracking-wide transition-colors ${activeMegaTab === item ? "text-teal-600" : "text-foreground hover:text-teal-600"
                  }`}
              >
                {item}
              </button>
              {index < megaMenuItems.length - 1 && (
                <span className="px-[1vw] min-[450px]:px-2 sm:px-3 lg:px-4 text-[#9a65ad] font-bold select-none text-[2.65vw] min-[450px]:text-[12px] sm:text-xs md:text-sm lg:text-base">
                  |
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {activeMegaTab && (
        <div className="absolute left-0 right-0 top-full border-b border-border/70 bg-background shadow-md max-h-[75vh] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
              {(megaMenuContent[activeMegaTab] ?? []).map((section) => (
                <div key={`section-${section.title}`} className="space-y-2.5">
                  <h3 className="text-xs md:text-sm lg:text-base font-semibold tracking-[0.1em] lg:tracking-[0.12em] text-[#9a65ad]">
                    {section.title}
                  </h3>
                  <ul className="space-y-1.5 md:space-y-2">
                    {section.links.map((link) => (
                      <li key={`link-${section.title}-${link}`}>
                        <Link
                          to="/products"
                          onClick={() => setActiveMegaTab(null)}
                          className="group flex items-center gap-1.5 text-sm lg:text-base text-gray-800 hover:text-teal-600 active:text-teal-700 transition-colors"
                        >
                          <svg className="w-2 h-2 text-gray-400 group-hover:text-teal-600 transition-colors fill-current mt-px" viewBox="0 0 24 24">
                            <path d="M5 3l14 9-14 9V3z" />
                          </svg>
                          {link}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MegaMenu;
