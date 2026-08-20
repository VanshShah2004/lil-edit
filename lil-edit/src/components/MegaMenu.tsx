import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const megaMenuItems = [
  "NEW ARRIVALS",
  "GIRLS",
  "BOYS",
  "TRENDING",
  "BY OCCASION",
];

/**
 * One row in a mega-menu column.
 *
 * `label` is the merchandising copy; `q` is what actually gets searched. They
 * are deliberately separate — "Lehengas" reads better in the menu than the
 * singular "Lehenga" that matches the titles, and "All" under GIRLS has to
 * carry its column's context ("Girls Ethnic Wear") or it would return the whole
 * catalog. Where a label has no vocabulary behind it yet (Lookbook, Quick
 * Picks, Super-hero), `q` is the label itself: the link fills in on its own the
 * moment a product is tagged that way in the admin, with no code change here.
 */
interface MegaLink {
  label: string;
  q: string;
}

/** Same destination the search bar submits to (see SearchPanel). */
const searchPath = (q: string) => `/search?q=${encodeURIComponent(q)}`;

/** Shorthand for the common case: the label IS the query. */
const same = (label: string): MegaLink => ({ label, q: label });

const megaMenuContent: Record<
  string,
  { title: string; links: MegaLink[] }[]
> = {
  "NEW ARRIVALS": [
    { title: "JUST IN", links: [
      { label: "All", q: "New Arrivals" },
      same("Daily New"),
      same("Ready To Ship"),
      same("Bestsellers"),
      { label: "Latest Sets", q: "Set" },
    ] },
    { title: "TRENDING", links: [
      same("Ethnic Wear"),
      same("Western Wear"),
      { label: "Fusion Looks", q: "Indo-Western" },
      same("Party Wear"),
      same("Lookbook"),
    ] },
    // The age ranges are the SIZES list from AddProduct verbatim — a size only
    // matches search when the query IS one, so invented buckets ("0-2 Years")
    // would find nothing. All twelve are listed rather than a sample, since any
    // size left out of the menu is a size no shopper can reach from the nav.
    { title: "SHOP BY AGE", links: [
      same("6-12 Months"),
      same("1-2 Years"),
      same("2-3 Years"),
      same("3-4 Years"),
      same("4-5 Years"),
      same("5-6 Years"),
      same("6-7 Years"),
      same("7-8 Years"),
      same("8-9 Years"),
      same("9-10 Years"),
      same("10-11 Years"),
      same("11-12 Years"),
    ] },
    { title: "MORE", links: [
      same("Accessories"),
      same("Shoes"),
      same("Bags"),
      same("Hair Essentials"),
      same("Stationery"),
    ] },
  ],
  "GIRLS": [
    { title: "ETHNIC WEAR", links: [
      { label: "All", q: "Girls Ethnic Wear" },
      { label: "Lehengas", q: "Lehenga" },
      { label: "Kurtis", q: "Kurti" },
      { label: "Shararas", q: "Sharara" },
      { label: "Sarees", q: "Saree" },
      { label: "Sets", q: "Girls Set" },
    ] },
    { title: "TRENDING", links: [
      same("New Arrivals"),
      same("Ready To Ship"),
      same("Wedding"),
      same("Reels"),
      same("Lookbook"),
    ] },
    { title: "DRESSES & SETS", links: [
      { label: "All", q: "Girls Dress" },
      { label: "Dresses", q: "Dress" },
      { label: "Gowns", q: "Gown" },
      { label: "Jumpsuits", q: "Jumpsuit" },
      { label: "Co-ords", q: "Co-ord Set" },
      { label: "Party Looks", q: "Girls Party Wear" },
    ] },
    { title: "MORE", links: [
      same("Hair Accessories"),
      { label: "Sleepwear", q: "Nightwear" },
      same("Shoes"),
      same("Bags"),
      same("Jewellery"),
      { label: "Other Apparel", q: "Girls" },
    ] },
  ],
  "BOYS": [
    { title: "◈ CLASSIC ETHNIC", links: [
      { label: "All", q: "Boys Ethnic Wear" },
      same("Kurta Pajama"),
      { label: "Kurta Dhoti", q: "Dhoti Kurta" },
      same("Pathani"),
      same("Angarakha"),
    ] },
    { title: "✧ ROYAL VIBES", links: [
      same("Sherwani"),
      same("Indo-Western"),
      { label: "Bandhgala Sets", q: "Bandhgala" },
      { label: "Nawabi Sets", q: "Nawabi" },
    ] },
    { title: "⟡ COOL & TRENDY", links: [
      { label: "Co-ord Sets", q: "Co-ord Set" },
      { label: "Printed Shirts", q: "Printed Shirt" },
      { label: "Smart Casuals", q: "Boys Casual Wear" },
      same("Mini Mahrajas"),
    ] },
    { title: "❖ THE LIL GENTLEMEN", links: [
      { label: "Shirts & Suspenders", q: "Shirt" },
      { label: "Blazers", q: "Blazer" },
      { label: "Waistcoat Sets", q: "Waistcoat" },
      { label: "Tuxedos", q: "Tuxedo" },
    ] },
  ],
  "TRENDING": [
    { title: "HOT RIGHT NOW", links: [
      same("Instagram Reels"),
      same("Celebrity Picks"),
      same("Top Rated"),
      { label: "Festive Edits", q: "Festive" },
      { label: "Wedding Edit", q: "Wedding" },
    ] },
    { title: "SEASONAL", links: [
      { label: "Summer Picks", q: "Summer" },
      { label: "Monsoon Ready", q: "Monsoon" },
      { label: "Winter Layers", q: "Winter" },
      { label: "Spring Colors", q: "Spring" },
    ] },
    { title: "SHOP BY LOOK", links: [
      { label: "Traditional", q: "Ethnic Wear" },
      { label: "Modern Ethnic", q: "Indo-Western" },
      { label: "Streetwear", q: "Casual Wear" },
      same("Elegant"),
      same("Minimal"),
    ] },
    { title: "THEME-BASED", links: [
      { label: "Super-hero Edit", q: "Super-hero" },
      { label: "Safari Style", q: "Safari" },
      same("Space Explorer"),
    ] },
  ],
  "BY OCCASION": [
    { title: "EVENTS", links: [
      same("Birthday"),
      same("Wedding"),
      same("Festive"),
      { label: "School Events", q: "School" },
      same("Family Function"),
    ] },
    { title: "STYLE TYPE", links: [
      { label: "Traditional", q: "Ethnic Wear" },
      { label: "Contemporary", q: "Western Wear" },
      { label: "Comfort Wear", q: "Casual Wear" },
      same("Party Wear"),
      { label: "Premium Edit", q: "Premium" },
    ] },
    { title: "SHOP FAST", links: [
      same("Ready To Ship"),
      same("Under 1999"),
      same("Matching Siblings"),
      same("Quick Picks"),
    ] },
    { title: "DISCOVER", links: [
      same("Top Collections"),
      same("Gift Sets"),
      same("Accessories"),
      { label: "New In", q: "New Arrivals" },
    ] },
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
      className="border-t border-border/60 bg-background w-full shadow-md relative z-0"
      onMouseLeave={() => window.innerWidth >= 768 && setActiveMegaTab(null)}
    >
      <div className="container mx-auto px-1 sm:px-4 lg:px-8 pt-0 pb-1.5 md:py-0.5 lg:py-1">
        <div className="flex items-center justify-center whitespace-nowrap overflow-x-auto no-scrollbar pb-1">
          {megaMenuItems.map((item, index) => (
            <div key={`unified-${item}`} className={`flex items-center${index === 0 ? " pl-44" : ""}${index === megaMenuItems.length - 1 ? " pr-44" : ""}`}>
              <button
                type="button"
                onMouseEnter={() => window.innerWidth >= 768 && setActiveMegaTab(item)}
                onClick={() => setActiveMegaTab((prev) => (prev === item ? null : item))}
                className={`px-[1.2vw] min-[450px]:px-2 sm:px-3 lg:px-4 py-1 text-[3.2vw] min-[450px]:text-[13px] sm:text-[12px] md:text-[11px] lg:text-[13px] font-bold tracking-tighter min-[450px]:tracking-tight sm:tracking-wide transition-colors ${activeMegaTab === item ? "text-teal-700 sm:text-teal-600" : "text-foreground hover:text-teal-700 sm:hover:text-teal-600"
                  }`}
              >
                {item}
              </button>
              {index < megaMenuItems.length - 1 && (
                <span className="px-[1vw] min-[450px]:px-2 sm:px-3 lg:px-4 text-[#7A4A8C] sm:text-[#9a65ad] font-bold select-none text-[3.2vw] min-[450px]:text-[13px] sm:text-[12px] md:text-[11px] lg:text-[13px]">
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
                  <h3 className="text-xs md:text-sm lg:text-base font-semibold tracking-[0.1em] lg:tracking-[0.12em] text-[#7A4A8C] sm:text-[#9a65ad]">
                    {section.title}
                  </h3>
                  <ul className="space-y-1.5 md:space-y-2">
                    {section.links.map((link) => (
                      <li key={`link-${section.title}-${link.label}`}>
                        <Link
                          to={searchPath(link.q)}
                          onClick={() => {
                            console.log("[MegaMenu]", activeMegaTab, "›", section.title, "›", link.label, "→ search:", link.q);
                            setActiveMegaTab(null);
                          }}
                          className="group flex items-center gap-1.5 text-sm lg:text-base text-gray-800 hover:text-teal-600 active:text-teal-700 transition-colors"
                        >
                          <svg className="w-2 h-2 text-gray-400 group-hover:text-teal-600 transition-colors fill-current mt-px" viewBox="0 0 24 24">
                            <path d="M5 3l14 9-14 9V3z" />
                          </svg>
                          {link.label}
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
