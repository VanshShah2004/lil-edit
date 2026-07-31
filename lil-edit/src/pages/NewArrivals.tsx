import ArrivalsPage, { type ArrivalsTheme } from "@/pages/arrivals/ArrivalsPage";

// Original New Arrivals palette — amber→rose→purple hero, teal accents.
const NEW_ARRIVALS_THEME: ArrivalsTheme = {
  heroBadge: "The Latest Drop",
  headingLead: "New",
  headingAccent: "Arrivals",
  headingGradient: "from-[#0C5D53] via-[#7B5AB5] to-emerald-700",
  heroBg: "from-amber-100 via-rose-100 to-purple-200",
  blobs: ["bg-rose-300", "bg-purple-300", "bg-amber-300"],
  spotlightBg: "from-amber-100 via-rose-100 to-purple-200",
  spotlightBlob: "bg-purple-200/40",
  accentText: "text-brand-teal",
  accentHoverText: "hover:text-brand-teal",
  freshBadgeBg: "bg-brand-teal",
  tickerWords: ["Just Landed", "New Drop", "Fresh Styles", "Limited Stock", "Be First", "The Lil Edit"],
  heroTagline: "Newest styles land here first. Blink and someone else's little one is wearing them.",
  emptyTitle: "Nothing new just yet",
  emptyBlurb: "Fresh styles are on their way. Explore our collections while you wait.",
  spotlightLabel: "Newest In Store",
};

export default function NewArrivals() {
  return <ArrivalsPage theme={NEW_ARRIVALS_THEME} />;
}
