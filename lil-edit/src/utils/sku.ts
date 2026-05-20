export { CATEGORY_MAP, generateCategoryCode, generateGenderCode } from "@shared/skuCodes";

export const generateColorCode = (colorName: string): string =>
  colorName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();

export const generateBaseSku = (category: string, gender: string, uniqueNumber: string | number): string => {
  const catCode = category ? generateCategoryCode(category) : "CAT";
  const genCode = gender    ? generateGenderCode(gender)    : "GEN";
  return `EDIT-${catCode}-${genCode}-${uniqueNumber}`;
};

export const generateColorSku = (baseSku: string, colorName: string): string =>
  `${baseSku}-${generateColorCode(colorName)}`;
