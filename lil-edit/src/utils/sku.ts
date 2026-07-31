import { generateCategoryCode, generateGenderCode } from "@shared/skuCodes";

export {
  CATEGORY_MAP,
  generateCategoryCode,
  generateGenderCode,
  generateColorCode,
  generateColorSku,
} from "@shared/skuCodes";

export const generateBaseSku = (category: string, gender: string, uniqueNumber: string | number): string => {
  const catCode = category ? generateCategoryCode(category) : "CAT";
  const genCode = gender    ? generateGenderCode(gender)    : "GEN";
  return `EDIT-${catCode}-${genCode}-${uniqueNumber}`;
};
