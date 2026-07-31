// Single source of truth for SKU code generation.
// Imported by backend (skuUtils.ts) and frontend (src/utils/sku.ts via @shared alias).
// Edit here only — never duplicate these definitions.

export const CATEGORY_MAP: Record<string, string> = {
  "Kids Ethnic Wear": "ETHNIC",
  "Party Wear":       "PARTY",
  "Casual Wear":      "CASUAL",
  "Nightwear":        "NIGHT",
  "Accessories":      "ACC",
};

export const generateCategoryCode = (category: string): string => {
  if (CATEGORY_MAP[category]) return CATEGORY_MAP[category];
  const clean = category.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (clean.length <= 4) return clean;
  const words = category.split(" ").filter(w => w.length > 0);
  if (words.length > 1) return words.map(w => w[0]).join("").toUpperCase();
  return clean.slice(0, 4);
};

export const generateGenderCode = (gender: string): string => {
  const map: Record<string, string> = {
    "Boys":   "BOY",
    "Girls":  "GIRL",
    "Unisex": "UNI",
  };
  return map[gender] ?? "GEN";
};

export const generateColorCode = (colorName: string): string =>
  colorName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();

export const generateColorSku = (baseSku: string, colorName: string): string =>
  `${baseSku}-${generateColorCode(colorName)}`;
