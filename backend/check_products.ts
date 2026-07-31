import { supabaseAdmin } from "./lib/supabase.js";

async function check() {
  if (!supabaseAdmin) {
    console.log("No supabase admin client configured.");
    return;
  }
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(`
      id,
      title,
      slug,
      category_slug,
      base_sku,
      product_variants(variant_sku)
    `);
  if (error) {
    console.error("Error fetching products:", error);
    return;
  }
  console.log("PUBLISHED PRODUCTS IN DATABASE:");
  console.log(JSON.stringify(data, null, 2));
}

check();
