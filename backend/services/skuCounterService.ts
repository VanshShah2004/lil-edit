import { supabaseAdmin } from "../lib/supabase.js";
import { generateCategoryCode, generateGenderCode } from "../utils/skuUtils.js";

/**
 * Service to handle SKU generation and counter management.
 */
export class SKUCounterService {
  private static readonly SKU_PREFIX = "EDIT";

  /**
   * Generates the next available SKU for a given category and gender.
   * This operation is atomic and reserves the number.
   */
  static async generateNextSKU(category: string, gender: string): Promise<string> {
    if (!supabaseAdmin) {
      throw new Error("Supabase admin client not configured.");
    }

    // 1. Generate codes first to use as keys in the database
    const catCode = generateCategoryCode(category);
    const genCode = generateGenderCode(gender);

    // 2. Get atomic incremented number from RPC using codes
    const { data: nextNumber, error } = await supabaseAdmin.rpc("increment_sku_counter", {
      p_category: catCode,
      p_gender: genCode,
    });

    if (error) {
      console.error("[SKUCounterService] Error incrementing counter:", error);
      throw new Error(`Failed to generate SKU: ${error.message}`);
    }

    // 3. Format the SKU
    const paddedNumber = String(nextNumber).padStart(4, "0");

    return `${this.SKU_PREFIX}-${catCode}-${genCode}-${paddedNumber}`;
  }

  /**
   * Validates if a manually provided SKU is unique across both draft and published products.
   */
  static async isSKUUnique(sku: string): Promise<boolean> {
    if (!supabaseAdmin) return true;

    // Check draft products
    const { data: draft, error: draftErr } = await supabaseAdmin
      .from("draft_products")
      .select("base_sku")
      .eq("base_sku", sku)
      .maybeSingle();

    if (draftErr) throw draftErr;
    if (draft) return false;

    // Check published products
    const { data: pub, error: pubErr } = await supabaseAdmin
      .from("products")
      .select("base_sku")
      .eq("base_sku", sku)
      .maybeSingle();

    if (pubErr) throw pubErr;
    if (pub) return false;

    return true;
  }
}
