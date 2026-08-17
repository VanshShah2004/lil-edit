// The four product categories that have their own listing page.
//
// These are the TAXONOMY — every product carries exactly one, chosen from the
// dropdown in AddProduct/EditProduct — and are deliberately separate from the
// storefront "collections" (New Arrivals, Girls, Boys, Trending, By Occasion),
// which are curated or derived views.
//
// The Collections page reaches them through its own "Shop by Category" section
// (components/collections/CategoryStrip), kept apart from the Browse Collections
// strip above it so the two aren't presented as the same kind of thing. They are
// still absent from the nav and from the Spotlight curation engine: nothing here
// is admin-editable, and adding a category means adding a hex to this list.
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
   * All four are kept DEEP, and at a similar weight, on purpose: paletteFor()
   * switches type from cream-and-gold to ink once a ground goes light, so mixing
   * a pastel into the set would give that one page a different-coloured headline
   * from its three siblings and break the run. Distinguish a category by HUE
   * here, not by lightness — maroon, plum, denim, charcoal.
   *
   * The light-ground branch of paletteFor() stays as a safety net rather than a
   * style: if someone does set a pastel, the type flips to ink and stays legible
   * instead of printing cream on cream.
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

// ─── The page's own palette, derived from the same one hex ───────────────────
// paletteFor() above dresses the PLACARD — type printed ON the ground. This
// dresses the PAGE the placard sits on: the paper, the hairlines, the ink and the
// one tinted fill that marks a selection.
//
// Both come from `field` and nothing else, which is the whole point. Four pages
// that are unmistakably four different rooms, out of four hex values — no
// per-category stylesheet to keep in step, and a fifth category would arrive
// fully dressed the moment someone adds its hex to the list below.

/** #rrggbb → HSL, hue in degrees, s/l in percent. */
function toHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };

  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) :
    max === g ? ((b - r) / d + 2) :
                ((r - g) / d + 4);
  return { h: h * 60, s: s * 100, l: l * 100 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export interface PagePalette {
  /** Hairline rules and card edges. */
  edge: string;
  /** Body-copy black, carrying the category's hue so nothing on the page is neutral. */
  ink: string;
  /** Labels and secondary copy — the same ink, stepped back. */
  inkSoft: string;
  /** The fill behind a selected age, chip or hovered card. */
  halo: string;
  /** Selected states and the page's one accent line. */
  mark: string;
}

/**
 * Only the HUE is taken from the ground. Saturation is clamped at both ends —
 * charcoal (#2F2D35) sits at 6% and would derive a dead neutral ink, a vivid
 * ground would derive a mark that shouts — and lightness is fixed per role
 * rather than scaled from the ground.
 *
 * That is what keeps the type consistent across the four pages: ink is 21% on
 * every one of them, so the same words land at the same weight and the same
 * contrast whichever category you are standing in.
 *
 * Note there is no page background here. The pages are white, like the rest of
 * the storefront; what this tints is the ink, the hairlines and the marks ON the
 * white — enough for a category to have a temperature without the paper changing
 * colour under it.
 */
export function pagePaletteFor(field: string): PagePalette {
  const { h, s } = toHsl(field);
  const hue = Math.round(h);
  return {
    edge:    `hsl(${hue} ${clamp(s * 0.4, 14, 30)}% 88%)`,
    ink:     `hsl(${hue} ${clamp(s * 0.45, 18, 34)}% 21%)`,
    inkSoft: `hsl(${hue} ${clamp(s * 0.3, 10, 22)}% 42%)`,
    halo:    `hsl(${hue} ${clamp(s * 0.5, 22, 44)}% 93%)`,
    mark:    `hsl(${hue} ${clamp(s * 0.6, 28, 52)}% 32%)`,
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
    field: "#512D6D", // deep plum — the brand's violet, taken to evening weight
  },
  {
    slug: "casual-wear",
    label: "Casual Wear",
    blurb: "Comfortable clothes for every day.",
    field: "#1F4E6D", // deep denim — the everyday cloth, at full saturation
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
