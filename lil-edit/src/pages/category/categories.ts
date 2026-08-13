// The four product categories that have their own listing page.
//
// These are the TAXONOMY — every product carries exactly one, chosen from the
// dropdown in AddProduct/EditProduct — and are deliberately separate from the
// storefront "collections" (New Arrivals, Girls, Boys, Trending, By Occasion),
// which are curated or derived views. Categories intentionally have no presence
// in the Browse Collections strip, the nav, or the Spotlight curation engine;
// they are reached by their own URLs only.
//
// `slug` must match what backend/lib/productMapper.ts slugify() produces from
// the category's display name, since it is also the :category segment of every
// PDP URL (/collections/<slug>/product/…). The backend keeps the same allow-list
// in routes/products.ts (CATEGORY_SLUGS) — keep the two in step.
export interface CategoryDef {
  slug: string;
  /** Display name, exactly as stored on the product. */
  label: string;
  /**
   * One plain line saying what the category holds. Keep them short and roughly the
   * same length — that is what makes the four placards come out level without
   * reserving space for copy that isn't there.
   */
  blurb: string;
  /**
   * The deep jewel ground the placard is printed on — the ONE thing that differs
   * between the four pages. Everything else, the placard's structure and the whole
   * listing below it, is identical, so the set reads as a single taxonomy rather
   * than four themed microsites.
   *
   * All four are dark enough to carry cream type at ~9:1, which is what lets the
   * placard be a saturated colour field instead of a tinted wash. Drawn from the
   * dyes this catalogue is actually full of: maroon, plum, forest, indigo.
   */
  field: string;
}

/**
 * Gold, shared by all four placards — the zari/gota trim running through Indian
 * kidswear, and the thread that ties the categories together as one set. Used
 * ONLY on the jewel field, never on the white page below, where it would fall
 * below contrast (there the storefront's brand teal plays the accent role).
 */
export const CATEGORY_TRIM = "#E3B23C";

/** Warm off-white for type printed on a jewel field. */
export const CATEGORY_CREAM = "#FAF6F0";

export const CATEGORIES: CategoryDef[] = [
  {
    slug: "ethnic-wear",
    label: "Ethnic Wear",
    blurb: "Traditional wear for festivals and weddings.",
    field: "#6E1B32", // maroon
  },
  {
    slug: "party-wear",
    label: "Party Wear",
    blurb: "Dressy outfits for parties and birthdays.",
    field: "#6B1F4D", // plum
  },
  {
    slug: "casual-wear",
    label: "Casual Wear",
    blurb: "Comfortable clothes for every day.",
    field: "#3A5A40", // forest
  },
  {
    slug: "accessories",
    label: "Accessories",
    blurb: "Bags, bows, belts and hair clips.",
    field: "#27356B", // indigo
  },
];

/** The category with this slug, or undefined if it names nothing we ship. */
export function categoryBySlug(slug: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
