import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

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
  /** Search query. Omitted when `to` names a real route instead. */
  q?: string;
  /** A real route (e.g. a category listing page) instead of a search. */
  to?: string;
}

/** Same destination the search bar submits to (see SearchPanel). */
const searchPath = (q: string) => `/search?q=${encodeURIComponent(q)}`;

/** Shorthand for the common case: the label IS the query. */
const same = (label: string): MegaLink => ({ label, q: label });

/** For the handful of labels that have their own real listing page. */
const category = (label: string, slug: string): MegaLink => ({ label, to: `/collections/${slug}` });

// A "shop everything in this tab" link, shown once above the columns rather
// than duplicated (and mis-scoped to a single column, as BOYS's old "All"
// under CLASSIC ETHNIC was — it only searched ethnic wear). Tabs without an
// entry here simply skip the header row.
//
// `to` is a real collection route, not a search query: the curated sub-collection
// page is a better landing spot than a keyword search when one exists.
const megaMenuViewAll: Partial<Record<string, { label: string; to: string }>> = {
  "NEW ARRIVALS": { label: "Shop All New Arrivals", to: "/collections/new-arrivals" },
  "GIRLS":        { label: "Shop All Girls",        to: "/collections/girls" },
  "BOYS":         { label: "Shop All Boys",         to: "/collections/boys" },
  "TRENDING":     { label: "Shop All Trending",     to: "/collections/trending" },
  "BY OCCASION":  { label: "Shop All Occasions",    to: "/collections/occasion" },
};

const megaMenuContent: Record<
  string,
  { title: string; links: MegaLink[] }[]
> = {
  "NEW ARRIVALS": [
    { title: "◈ LITTLE TRADITIONS", links: [
      category("Ethnic Wear", "ethnic-wear"),
      category("Party Wear", "party-wear"),
      category("Casual Wear", "casual-wear"),
      same("Western Wear"),
    ] },
    { title: "✧ THE STYLE SPOTLIGHT", links: [
      same("Bestsellers"),
      same("Featured"),
      same("Trendy"),
      same("New Arrivals"),
    ] },
  ],
  "GIRLS": [
    { title: "◈ TIMELESS ETHNIC", links: [
      { label: "Lehengas", q: "Lehenga" },
      { label: "Kurtis", q: "Kurti" },
      { label: "Shararas", q: "Sharara" },
      { label: "Ethnic Sets", q: "Girls Set" },
    ] },
    { title: "✧ FRESH & FESTIVE", links: [
      { label: "Sarees", q: "Saree" },
      { label: "Anarkalis", q: "Anarkali" },
      { label: "Festive Sets", q: "Festive Set" },
      { label: "Wedding Edit", q: "Wedding" },
    ] },
    { title: "⟡ PARTY & PLAY", links: [
      { label: "Dresses", q: "Dress" },
      { label: "Gowns", q: "Gown" },
      { label: "Jumpsuits", q: "Jumpsuit" },
      { label: "Co-ord Sets", q: "Co-ord Set" },
    ] },
    { title: "♡ LIL ANGELS", links: [
      { label: "Frocks", q: "Frock" },
      { label: "Tops & Tees", q: "Girls Tops" },
      { label: "Skirts", q: "Girls Skirt" },
      { label: "Shorts & Bottoms", q: "Girls Bottoms" },
    ] },
  ],
  "BOYS": [
    { title: "◈ CLASSIC ETHNIC", links: [
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
    { title: "◆ HOT RIGHT NOW", links: [
      same("Instagram Reels"),
      same("Top Rated"),
      { label: "Festive Edits", q: "Festive" },
      same("Theme Based"),
    ] },
    { title: "✧ SHOP BY LOOK", links: [
      same("Elegant"),
      { label: "Modern Ethnic", q: "Indo-Western" },
      { label: "Minimal & Casual", q: "Minimal Casual" },
      same("Party Perfect"),
    ] },
  ],
  "BY OCCASION": [
    { title: "◆ THE BIG DAY", links: [
      { label: "Wedding & Sangeet", q: "Wedding Sangeet" },
      same("Party Wear"),
      { label: "Birthday Special", q: "Birthday" },
      { label: "Ethnic Edit", q: "Ethnic Wear" },
    ] },
    { title: "✺ FESTIVE CALENDAR", links: [
      { label: "Diwali Edit", q: "Diwali" },
      { label: "Navratri & Garba", q: "Navratri" },
      { label: "Raksha Bandhan", q: "Rakhi" },
      { label: "Mehendi", q: "Mehndi" },
    ] },
  ],
};

const MegaMenu = () => {
  const [activeMegaTab, setActiveMegaTab] = useState<string | null>(null);
  const megaMenuRef = useRef<HTMLDivElement | null>(null);
  const activeSections = activeMegaTab ? megaMenuContent[activeMegaTab] ?? [] : [];

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
            {megaMenuViewAll[activeMegaTab] && (
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-5 w-1 rounded-full bg-gradient-to-b from-brand-teal to-[#9a65ad] shrink-0" />
                  <h2 className="font-display text-lg md:text-xl font-black tracking-tight text-foreground truncate">
                    {activeMegaTab}
                  </h2>
                </div>
                <Link
                  to={megaMenuViewAll[activeMegaTab]!.to}
                  onClick={() => setActiveMegaTab(null)}
                  className="group inline-flex items-center gap-2 rounded-full border border-teal-700/25 bg-teal-700/5 pl-4 pr-1.5 py-1.5 text-xs md:text-sm font-bold uppercase tracking-[0.12em] text-teal-800 shadow-sm transition-all duration-300 hover:border-transparent hover:bg-teal-700 hover:text-white hover:shadow-md"
                >
                  {megaMenuViewAll[activeMegaTab]!.label}
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-white transition-colors duration-300 group-hover:bg-white group-hover:text-teal-700">
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-px" strokeWidth={3} />
                  </span>
                </Link>
              </div>
            )}
            <div
              className={`grid grid-cols-2 gap-4 sm:gap-6 md:gap-8 ${
                activeSections.length >= 4
                  ? "md:grid-cols-4"
                  : activeSections.length === 3
                  ? "md:grid-cols-3 md:max-w-4xl md:mx-auto"
                  : "md:grid-cols-2 md:max-w-2xl md:mx-auto"
              }`}
            >
              {activeSections.map((section) => (
                <div key={`section-${section.title}`} className="space-y-2.5">
                  <h3 className="text-xs md:text-sm lg:text-base font-semibold tracking-[0.1em] lg:tracking-[0.12em] text-[#7A4A8C] sm:text-[#9a65ad]">
                    {section.title}
                  </h3>
                  <ul className="space-y-1.5 md:space-y-2">
                    {section.links.map((link) => (
                      <li key={`link-${section.title}-${link.label}`}>
                        <Link
                          to={link.to ?? searchPath(link.q!)}
                          onClick={() => {
                            console.log("[MegaMenu]", activeMegaTab, "›", section.title, "›", link.label, link.to ? "→ page:" : "→ search:", link.to ?? link.q);
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
