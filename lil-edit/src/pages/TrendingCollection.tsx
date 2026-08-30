import ArrivalsPage, { type ArrivalsTheme } from "@/pages/arrivals/ArrivalsPage";

// Trending page — fiery orange/amber take on the New Arrivals layout. Shows
// only admin-flagged Trending products; flat grid (a drop timeline would just
// bucket most trending pieces under the long tail).
const TRENDING_THEME: ArrivalsTheme = {
  trending: true,
  sectionMode: "flat",
  heroBadge: "Hot Right Now",
  headingLead: "Trending",
  headingAccent: "Now",
  headingGradient: "from-orange-600 via-red-500 to-rose-600",
  heroBg: "from-orange-100 via-amber-100 to-rose-200",
  blobs: ["bg-orange-300", "bg-rose-300", "bg-amber-300"],
  spotlightBg: "from-orange-100 via-amber-100 to-rose-200",
  spotlightBlob: "bg-orange-200/40",
  accentText: "text-orange-600",
  accentHoverText: "hover:text-orange-600",
  freshBadgeBg: "bg-orange-500",
  tickerWords: ["Hot Right Now", "Most Wanted", "Everyone's Wearing It", "Trending", "Don't Miss Out", "The Lil Edit"],
  heroTagline: "The pieces everyone's talking about most-loved styles, flying off the shelves.",
  emptyTitle: "Nothing trending just yet",
  emptyBlurb: "The next big thing is loading. Explore our collections while you wait.",
  spotlightLabel: "Trending Hardest",
  // Trending's tagline is the one line that FITS in max-w-xl (564px of 576), so
  // the hero would sit 24px (one line) shorter than New Arrivals, Boys and
  // Occasion. Same override, same reason, as the Girls page.
  heroPadY: "py-28 md:py-[8.75rem]",
};

export default function TrendingCollection() {
  return <ArrivalsPage theme={TRENDING_THEME} />;
}
