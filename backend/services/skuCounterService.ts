import { supabaseAdmin } from "../lib/supabase.js";
import { generateCategoryCode, generateGenderCode } from "../utils/skuUtils.js";
import { type OpLogger } from "../lib/logger.js";

export class SKUCounterService {
  private static readonly SKU_PREFIX = "EDIT";

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
