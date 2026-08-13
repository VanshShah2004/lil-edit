import { Sparkles, Heart, Star, TrendingUp, PartyPopper, type LucideIcon } from "lucide-react";
import type { CollectionCounts } from "@/services/searchService";

// Every collection listing the storefront has, and the single source of truth for
// the "Browse Collections" strip. Icons match the ones the side menu uses for
// these same links (components/home/UserNavbar), so the two navigations agree on
// what each collection looks like.
//
// Shared with the admin Spotlight: a collections_browse tile names its target in
// meta.collection, and `key` is the value stored there. Keep these keys stable —
// renaming one orphans every tile already pointing at it (the placard silently
// falls back to its defaults). countKey maps the entry onto its field in the
// /collection-counts payload.
export interface SubCollection {
  key: string;
  to: string;
  countKey: keyof CollectionCounts;
  label: string;
  blurb: string;
  icon: LucideIcon;
  gradient: string;
}

export const SUB_COLLECTIONS: SubCollection[] = [
  { key: "new-arrivals", to: "/collections/new-arrivals", countKey: "newArrivals", label: "New Arrivals", blurb: "Fresh drops landing every week",   icon: Sparkles,    gradient: "from-emerald-100 to-teal-200" },
  { key: "girls",        to: "/collections/girls",        countKey: "girls",       label: "Girls",        blurb: "Twirly dresses for little trendsetters", icon: Heart,       gradient: "from-pink-100 to-rose-200" },
  { key: "boys",         to: "/collections/boys",         countKey: "boys",        label: "Boys",         blurb: "Everyday fits built for adventure", icon: Star,        gradient: "from-blue-100 to-cyan-200" },
  { key: "trending",     to: "/collections/trending",     countKey: "trending",    label: "Trending",     blurb: "The pieces everyone's loving now",  icon: TrendingUp,  gradient: "from-amber-100 to-orange-200" },
  { key: "occasion",     to: "/collections/occasion",     countKey: "occasion",    label: "By Occasion",  blurb: "Outfits dressed up for celebrations", icon: PartyPopper, gradient: "from-purple-100 to-indigo-200" },
];

/** Label for a stored meta.collection key, or null if it names nothing we ship. */
export function subCollectionLabel(key: string): string | null {
  return SUB_COLLECTIONS.find((c) => c.key === key)?.label ?? null;
}
