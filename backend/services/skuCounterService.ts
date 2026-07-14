import { supabaseAdmin } from "../lib/supabase.js";
import { generateCategoryCode, generateGenderCode } from "../utils/skuUtils.js";
import { type OpLogger } from "../lib/logger.js";

export class SKUCounterService {
  private static readonly SKU_PREFIX = "EDIT";

  /**
   * Read-only preview of the next SKU for this category/gender. Never touches
   * sku_counters, so browsing category/gender combos in the Add Product form
   * burns nothing. The number shown is provisional: the binding reservation
   * happens via generateNextSKU on the actual save path (draft save / launch),
   * which may hand back a later number if another admin saved in between.
   */
  static async peekNextSKU(
    category: string,
    gender: string,
    log: OpLogger,
  ): Promise<string> {
    if (!supabaseAdmin) {
      throw new Error("Supabase admin client not configured.");
    }

    const catCode = generateCategoryCode(category);
    const genCode = generateGenderCode(gender);
    log.step(`codes  category=${catCode}  gender=${genCode}`);

    log.step("DB read - sku_counters (peek, no increment)");
    const { data, error } = await supabaseAdmin
      .from("sku_counters")
      .select("last_assigned_number")
      .eq("category", catCode)
      .eq("gender", genCode)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to preview SKU: ${error.message}`);
    }

    const nextNumber   = (data?.last_assigned_number ?? 0) + 1;
    const paddedNumber = String(nextNumber).padStart(4, "0");
    const sku          = `${this.SKU_PREFIX}-${catCode}-${genCode}-${paddedNumber}`;
    log.step(`peek counter=${nextNumber}  formatted=${sku}  (not reserved)`);
    return sku;
  }

  static async generateNextSKU(
    category: string,
    gender: string,
    log: OpLogger,
  ): Promise<string> {
    if (!supabaseAdmin) {
      throw new Error("Supabase admin client not configured.");
    }

    const catCode = generateCategoryCode(category);
    const genCode = generateGenderCode(gender);
    log.step(`codes  category=${catCode}  gender=${genCode}`);

    log.step("DB RPC - increment_sku_counter");
    const { data: nextNumber, error } = await supabaseAdmin.rpc("increment_sku_counter", {
      p_category: catCode,
      p_gender:   genCode,
    });

    if (error) {
      throw new Error(`Failed to generate SKU: ${error.message}`);
    }

    const paddedNumber = String(nextNumber).padStart(4, "0");
    const sku          = `${this.SKU_PREFIX}-${catCode}-${genCode}-${paddedNumber}`;
    log.step(`counter=${nextNumber}  formatted=${sku}`);
    return sku;
  }

  static async isSKUUnique(sku: string, log: OpLogger): Promise<boolean> {
    if (!supabaseAdmin) return true;

    log.step(`DB check - draft_products  sku=${sku}`);
    const { data: draft, error: draftErr } = await supabaseAdmin
      .from("draft_products")
      .select("base_sku")
      .eq("base_sku", sku)
      .maybeSingle();

    if (draftErr) throw draftErr;
    if (draft) {
      log.step("sku already exists in draft_products");
      return false;
    }

    log.step(`DB check - products  sku=${sku}`);
    const { data: pub, error: pubErr } = await supabaseAdmin
      .from("products")
      .select("base_sku")
      .eq("base_sku", sku)
      .maybeSingle();

    if (pubErr) throw pubErr;
    if (pub) {
      log.step("sku already exists in products");
      return false;
    }

    log.step("sku is unique");
    return true;
  }
}
