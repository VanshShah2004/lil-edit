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
   * Deep grounds for the dressed-up categories, bright pastels for the everyday
   * ones. Anything legible works: paletteFor() derives the type, trim and texture
   * colours from this value's luminance, so a ground can be swapped for a lighter
   * or darker one without hand-editing anything else.
   */
  field: string;
}

/**
 * Gold — the zari trim running through Indian kidswear. Used on the DEEP grounds
 * only, never on the white page below or on a pastel ground, where it falls below
 * contrast (there the ink below plays the accent role instead).
 */
export const CATEGORY_TRIM = "#E3B23C";

/** Warm off-white for type printed on a deep ground. */
export const CATEGORY_CREAM = "#FAF6F0";

/** Deep aubergine for type printed on a pastel ground. */
export const CATEGORY_INK = "#2A2233";

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export interface FieldPalette {
  /** Headline / name colour. */
  text: string;
  /** Standfirst and label colour — the same hue, stepped back. */
  textMuted: string;
  /** Rule and numeral colour. (The tile arrows follow `text`, not this.) */
  trim: string;
  /** The bandhani dot texture — white on deep grounds, ink on pastel ones. */
  dots: string;
}

/**
 * The colours that read on a given ground, chosen by how light it is rather than
 * configured per category. A deep ground takes cream type and the gold trim; a
 * pastel takes the ink instead, since gold on a pastel is illegible. Deriving it
 * means the palette can gain a bright colour without every category needing its
 * own hand-picked set of four values that could drift out of contrast.
 */
export function paletteFor(field: string): FieldPalette {
  return luminance(field) < 0.3
    ? {
        text: CATEGORY_CREAM,
        textMuted: "rgba(250, 246, 240, 0.78)",
        trim: CATEGORY_TRIM,
        dots: "rgba(255, 255, 255, 0.13)",
      }
    : {
        text: CATEGORY_INK,
        textMuted: "rgba(42, 34, 51, 0.72)",
        trim: CATEGORY_INK,
        dots: "rgba(42, 34, 51, 0.07)",
      };
}

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
    field: "#F7B7C9", // blush pink
  },
  {
    slug: "casual-wear",
    label: "Casual Wear",
    blurb: "Comfortable clothes for every day.",
    field: "#A8D4F2", // sky blue
  },
  {
    slug: "accessories",
    label: "Accessories",
    blurb: "Bags, bows, belts and hair clips.",
    field: "#2F2D35", // charcoal
  },
];

/** The category with this slug, or undefined if it names nothing we ship. */
export function categoryBySlug(slug: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
