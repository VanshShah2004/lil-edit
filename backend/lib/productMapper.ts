/**
 * Maps Curation Studio JSON (Add Product page) to catalog row shapes.
 */

export type CurationPayload = Record<string, unknown>;

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/&/g, "-and-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function asString(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function asNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asBool(v: unknown): boolean {
  return Boolean(v);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export interface ColorVariantInput {
  name: string;
  hex: string;
  sku: string;
  stock: number;
  images: string[];
}

function asColorVariants(v: unknown): ColorVariantInput[] {
  if (!Array.isArray(v)) return [];
  const out: ColorVariantInput[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    out.push({
      name: asString(o.name, "Color"),
      hex: asString(o.hex, "#cccccc"),
      sku: asString(o.sku, "SKU-UNKNOWN"),
      stock: asNum(o.stock),
      images: Array.isArray(o.images) ? o.images.filter((x): x is string => typeof x === "string") : [],
    });
  }
  return out;
}

export type ProductRowDraft = {
  title: string;
  brand: string;
  base_sku: string;
  slug: string;
  category: string;
  category_slug: string;
  gender: string;
  price: number;
  original_price: number | null;
  fabric: string | null;
  fit: string | null;
  occasion: string | null;
  care_instructions: string | null;
  description_points: string[];
  sizes: string[];
  tags: string[];
  badges: string[];
  is_featured: boolean;
  is_new_arrival: boolean;
  is_bestseller: boolean;
  is_trending: boolean;
};

export type ProductRowPublished = ProductRowDraft & { status: "PUBLISHED" };

export type VariantRowInsert = {
  color_name: string;
  color_hex: string | null;
  variant_sku: string;
  stock: number;
  sort_order: number;
};

export type ImageRowInsert = {
  image_url: string;
  alt_text: string | null;
  is_primary: boolean;
  is_campaign: boolean;
  sort_order: number;
  /** null = global gallery */
  variant_color_name: string | null;
};

export function mapCurationPayloadToCatalog(data: CurationPayload): {
  productDraft: ProductRowDraft;
  productPublished: ProductRowPublished;
  variants: VariantRowInsert[];
  images: ImageRowInsert[];
} {
  const title = asString(data.name, "Untitled Product").trim() || "Untitled Product";
  const slugRaw = asString(data.slug).trim();
  const slug = slugRaw || slugify(title);
  const category = asString(data.category, "General").trim() || "General";
  const categorySlugRaw = asString(data.categorySlug).trim();
  const category_slug = categorySlugRaw || slugify(category);

  const variants = asColorVariants(data.selectedColors);

  const original = asString(data.originalPrice).trim();
  const original_price = original === "" ? null : asNum(data.originalPrice);

  const productBase: ProductRowDraft = {
    title,
    brand: asString(data.brand, "The Lil Edit").trim() || "The Lil Edit",
    base_sku: asString(data.sku, "SKU-UNKNOWN").trim() || "SKU-UNKNOWN",
    slug,
    category,
    category_slug,
    gender: asString(data.gender, "Unisex").trim() || "Unisex",
    price: asNum(data.price),
    original_price,
    fabric: asString(data.fabric).trim() || null,
    fit: asString(data.fit).trim() || null,
    occasion: asString(data.occasion).trim() || null,
    care_instructions: asString(data.care).trim() || null,
    description_points:
      asStringArray(data.descriptionPoints).length > 0
        ? asStringArray(data.descriptionPoints)
        : ["No product details added yet."],
    sizes:
      asStringArray(data.selectedSizes).length > 0
        ? asStringArray(data.selectedSizes)
        : ["Free Size"],
    tags: asStringArray(data.tags),
    badges: asStringArray(data.customBadges),
    is_featured: asBool(data.featured),
    is_new_arrival: asBool(data.newArrival),
    is_bestseller: asBool(data.bestseller),
    is_trending: asBool(data.trending),
  };

  const images: ImageRowInsert[] = [];
  const globalPreviews = Array.isArray(data.imagePreviews)
    ? data.imagePreviews.filter((x): x is string => typeof x === "string")
    : [];

  globalPreviews.forEach((url, i) => {
    images.push({
      image_url: url,
      alt_text: `${title} — global ${i + 1}`,
      is_primary: i === 0,
      is_campaign: false,
      sort_order: i,
      variant_color_name: null,
    });
  });

  variants.forEach((v, vi) => {
    v.images.forEach((url, ii) => {
      images.push({
        image_url: url,
        alt_text: `${title} — ${v.name} ${ii + 1}`,
        is_primary: ii === 0,
        is_campaign: false,
        sort_order: vi * 1000 + ii,
        variant_color_name: v.name,
      });
    });
  });

  const variantRows: VariantRowInsert[] = variants.map((v, i) => ({
    color_name: v.name,
    color_hex: v.hex || null,
    variant_sku: v.sku.trim() || `${productBase.base_sku}-${slugify(v.name)}`,
    stock: v.stock,
    sort_order: i,
  }));

  return {
    productDraft: productBase,
    productPublished: { ...productBase, status: "PUBLISHED" },
    variants: variantRows,
    images,
  };
}
