import ArrivalsPage, { type ArrivalsTheme } from "@/pages/arrivals/ArrivalsPage";

// By Occasion page — festive violet/purple take on the New Arrivals layout.
// Sections group by each product's occasion (Festive, Wedding, …) instead of
// the drop timeline.
const OCCASION_THEME: ArrivalsTheme = {
  sectionMode: "occasions",
  heroBadge: "Dressed for the Moment",
  headingLead: "By",
  headingAccent: "Occasion",
  headingGradient: "from-violet-700 via-purple-600 to-indigo-600",
  heroBg: "from-violet-100 via-purple-100 to-indigo-200",
  blobs: ["bg-violet-300", "bg-indigo-300", "bg-purple-300"],
  spotlightBg: "from-violet-100 via-purple-100 to-indigo-200",
  spotlightBlob: "bg-violet-200/40",
  accentText: "text-violet-700",
  accentHoverText: "hover:text-violet-700",
  freshBadgeBg: "bg-violet-600",
  tickerWords: ["Festive", "Weddings", "Birthdays", "Playdates", "Every Moment Covered", "The Lil Edit"],
  heroTagline: "Weddings, festivals, birthdays or just Tuesday — find the perfect outfit for every moment.",
  emptyTitle: "Nothing here just yet",
  emptyBlurb: "Occasion-ready styles are on their way. Explore our collections while you wait.",
  spotlightLabel: "Moment Maker",
};

export default function OccasionCollection() {
  return <ArrivalsPage theme={OCCASION_THEME} />;
}
