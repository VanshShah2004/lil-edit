import ArrivalsPage, { type ArrivalsTheme } from "@/pages/arrivals/ArrivalsPage";

// Girls page — rose/pink/fuchsia take on the New Arrivals layout.
const GIRLS_THEME: ArrivalsTheme = {
  gender: "girls",
  heroBadge: "The Girls' Edit",
  headingLead: "Girls'",
  headingAccent: "Collection",
  headingGradient: "from-rose-600 via-pink-500 to-fuchsia-600",
  heroBg: "from-rose-100 via-pink-100 to-fuchsia-200",
  blobs: ["bg-rose-300", "bg-fuchsia-300", "bg-pink-300"],
  spotlightBg: "from-rose-100 via-pink-100 to-fuchsia-200",
  spotlightBlob: "bg-fuchsia-200/40",
  accentText: "text-rose-600",
  accentHoverText: "hover:text-rose-600",
  freshBadgeBg: "bg-rose-500",
  tickerWords: ["For the Girls", "Twirl-Ready", "New Drop", "Fresh Styles", "Little Icons", "The Lil Edit"],
  heroTagline: "Dresses, twirls and everything in between the latest styles for your little girl.",
  emptyTitle: "Nothing here just yet",
  emptyBlurb: "New girls' styles are on their way. Explore our collections while you wait.",
  spotlightLabel: "Fresh for Girls",
  heroPadY: "py-28 md:py-[8.75rem]",
};

export default function GirlsCollection() {
  return <ArrivalsPage theme={GIRLS_THEME} />;
}
