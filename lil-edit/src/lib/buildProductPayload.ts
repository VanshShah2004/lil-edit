export interface CurationPayload {
  name: string;
  brand: string;
  sku: string;
  slug: string;
  categorySlug: string;
  category: string;
  gender: string;
  price: string;
  originalPrice: string;
  fabric: string;
  fit: string;
  occasion: string;
  care_instructions: string;
  /** size_charts.id the product's size guide points at; "" = none chosen. */
  sizeChartId: string;
  descriptionPoints: string[];
  tags: string[];
  selectedSizes: string[];
  selectedColors: {
    name: string;
    hex: string;
    sku: string;
    stock: number | null;
    isUnlimited: boolean;
    images: string[];
  }[];
  customBadges: string[];
  featured: boolean;
  newArrival: boolean;
  bestseller: boolean;
  trending: boolean;
  isStockUnlimited: boolean;
  imagePreviews: string[];
}

interface FormLike {
  name: string;
  brand: string;
  sku: string;
  slug: string;
  categorySlug: string;
  category: string;
  gender: string;
  price: string;
  originalPrice: string;
  fabric: string;
  fit: string;
  occasion: string;
  care_instructions: string;
  sizeChartId: string;
  descriptionPoints: string[];
  tags: string[];
  selectedSizes: string[];
  selectedColors: { name: string; hex: string; sku: string; stock: number; isUnlimited?: boolean; images: string[] }[];
  customBadges: string[];
  featured: boolean;
  newArrival: boolean;
  bestseller: boolean;
  trending: boolean;
}

const isPriceGiven = (v: string) => Number(v.trim()) > 0;

/**
 * When the admin fills in only one of Selling Price / Original Price (MRP), that
 * value IS the selling price and there is no MRP. Mirrors resolvePrices in
 * backend/lib/productMapper.ts, which is what actually gets saved.
 */
export function resolveFormPrices(price: string, originalPrice: string): { price: string; originalPrice: string } {
  if (!isPriceGiven(price) && isPriceGiven(originalPrice)) {
    return { price: originalPrice.trim(), originalPrice: "" };
  }
  return { price, originalPrice };
}

/** The same rule as numbers, for the in-form preview: no MRP reads as MRP = selling price, as the API serves it. */
export function resolvePreviewPrices(price: string, originalPrice: string): { price: number; originalPrice: number } {
  const resolved = resolveFormPrices(price, originalPrice);
  const selling = Number(resolved.price) || 0;
  return { price: selling, originalPrice: Number(resolved.originalPrice) || selling };
}

export function buildPayloadFromForm(
  formData: FormLike,
  imagePreviews: string[],
  isStockUnlimited: boolean
): CurationPayload {
  return {
    name: formData.name,
    brand: formData.brand,
    sku: formData.sku,
    slug: formData.slug,
    categorySlug: formData.categorySlug,
    category: formData.category,
    gender: formData.gender,
    ...resolveFormPrices(formData.price, formData.originalPrice),
    fabric: formData.fabric,
    fit: formData.fit,
    occasion: formData.occasion,
    care_instructions: formData.care_instructions,
    sizeChartId: formData.sizeChartId,
    descriptionPoints: formData.descriptionPoints,
    tags: formData.tags,
    selectedSizes: formData.selectedSizes,
    selectedColors: formData.selectedColors.map(c => ({
      name: c.name,
      hex: c.hex,
      sku: c.sku,
      stock: c.isUnlimited ? null : c.stock,
      isUnlimited: !!c.isUnlimited,
      images: c.images,
    })),
    customBadges: formData.customBadges,
    featured: formData.featured,
    newArrival: formData.newArrival,
    bestseller: formData.bestseller,
    trending: formData.trending,
    isStockUnlimited,
    imagePreviews,
  };
}

interface DbImage {
  image_url: string;
  variant_id: string | null;
}

interface DbVariant {
  id: string;
  color_name: string;
  color_hex: string;
  variant_sku: string;
  stock: number | null;
  is_unlimited: boolean;
}

interface DbProduct {
  title: string;
  brand: string;
  base_sku: string;
  slug: string;
  category_slug: string;
  category: string;
  gender?: string;
  price: number;
  original_price?: number;
  fabric?: string;
  fit?: string;
  occasion?: string;
  care_instructions?: string;
  size_chart_id?: string | null;
  description_points?: string[];
  tags?: string[];
  sizes?: string[];
  badges?: string[];
  is_featured?: boolean;
  is_new_arrival?: boolean;
  is_bestseller?: boolean;
  is_trending?: boolean;
  is_unlimited?: boolean;
}

export function buildPayloadFromProduct(
  product: DbProduct,
  images: DbImage[],
  variants: DbVariant[]
): CurationPayload {
  return {
    name: product.title || "Untitled Product",
    brand: product.brand || "The Lil Edit",
    sku: product.base_sku || "SKU-UNKNOWN",
    slug: product.slug || "",
    categorySlug: product.category_slug || "",
    category: product.category || "General",
    gender: product.gender || "Unisex",
    price: String(product.price ?? 0),
    originalPrice: String(product.original_price ?? ""),
    fabric: product.fabric || "",
    fit: product.fit || "",
    occasion: product.occasion || "",
    care_instructions: product.care_instructions || "",
    sizeChartId: product.size_chart_id || "",
    descriptionPoints: product.description_points || [],
    tags: product.tags || [],
    selectedSizes: product.sizes || [],
    customBadges: product.badges || [],
    featured: !!product.is_featured,
    newArrival: !!product.is_new_arrival,
    bestseller: !!product.is_bestseller,
    trending: !!product.is_trending,
    isStockUnlimited: !!product.is_unlimited,
    imagePreviews: images.filter(img => !img.variant_id).map(img => img.image_url),
    selectedColors: variants.map(v => ({
      name: v.color_name || "Color",
      hex: v.color_hex || "#cccccc",
      sku: v.variant_sku || "",
      stock: v.is_unlimited ? null : Number(v.stock ?? 0),
      isUnlimited: !!v.is_unlimited,
      images: images.filter(img => img.variant_id === v.id).map(img => img.image_url),
    })),
  };
}
