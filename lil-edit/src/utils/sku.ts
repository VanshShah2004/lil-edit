const CATEGORY_MAP: Record<string, string> = {
  "Kids Ethnic Wear": "ETHNIC",
  "Party Wear": "PARTY",
  "Casual Wear": "CASUAL",
  "Nightwear": "NIGHT",
  "Accessories": "ACC",
};

export const generateCategoryCode = (category: string): string => {
  // Check for explicit mapping first
  if (CATEGORY_MAP[category]) return CATEGORY_MAP[category];

  // Fallback to original logic
  const clean = category.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (clean.length <= 4) return clean;
  
  const words = category.split(" ").filter(w => w.length > 0);
  if (words.length > 1) {
    return words.map(w => w[0]).join("").toUpperCase();
  }
  
  return clean.slice(0, 4);
};

export const generateColorCode = (colorName: string): string => {
  return colorName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
};

export const generateGenderCode = (gender: string): string => {
  const map: Record<string, string> = {
    "Boys": "BOY",
    "Girls": "GIRL",
    "Unisex": "UNI"
  };
  return map[gender] || "GEN";
};

export const generateBaseSku = (category: string, gender: string, uniqueNumber: string | number): string => {
  const catCode = category ? generateCategoryCode(category) : "CAT";
  const genCode = gender ? generateGenderCode(gender) : "GEN";
  return `EDIT-${catCode}-${genCode}-${uniqueNumber}`;
};

export const generateColorSku = (baseSku: string, colorName: string): string => {
  const colorCode = generateColorCode(colorName);
  // Ensure we don't double up the SKU if baseSku already contains it
  return `${baseSku}-${colorCode}`;
};
