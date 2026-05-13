export const generateCategoryCode = (category: string): string => {
  // Remove spaces and special chars, take first 4 letters or first letters of each word
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

export const generateBaseSku = (category: string, uniqueNumber: string | number): string => {
  const catCode = generateCategoryCode(category);
  return `EDIT-${catCode}-${uniqueNumber}`;
};

export const generateColorSku = (baseSku: string, colorName: string): string => {
  const colorCode = generateColorCode(colorName);
  // Ensure we don't double up the SKU if baseSku already contains it
  return `${baseSku}-${colorCode}`;
};
