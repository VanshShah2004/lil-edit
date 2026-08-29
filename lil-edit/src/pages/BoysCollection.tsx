import ArrivalsPage, { type ArrivalsTheme } from "@/pages/arrivals/ArrivalsPage";

// Boys page — sky/blue/indigo take on the New Arrivals layout.
const BOYS_THEME: ArrivalsTheme = {
  gender: "boys",
  heroBadge: "The Boys' Edit",
  headingLead: "Boys'",
  headingAccent: "Collection",
  headingGradient: "from-blue-700 via-sky-600 to-indigo-600",
  heroBg: "from-sky-100 via-blue-100 to-indigo-200",
  blobs: ["bg-sky-300", "bg-indigo-300", "bg-blue-300"],
  spotlightBg: "from-sky-100 via-blue-100 to-indigo-200",
  spotlightBlob: "bg-indigo-200/40",
  accentText: "text-blue-700",
  accentHoverText: "hover:text-blue-700",
  freshBadgeBg: "bg-blue-600",
  tickerWords: ["For the Boys", "Adventure-Ready", "New Drop", "Fresh Styles", "Little Legends", "The Lil Edit"],
  heroTagline: "Sharp kurtas, cool co-ords and playground-proof picks the latest for your little guy.",
  emptyTitle: "Nothing here just yet",
  emptyBlurb: "New boys' styles are on their way. Explore our collections while you wait.",
  spotlightLabel: "Fresh for Boys",
};

export default function BoysCollection() {
  return <ArrivalsPage theme={BOYS_THEME} />;
}
