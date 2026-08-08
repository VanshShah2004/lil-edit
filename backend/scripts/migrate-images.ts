#!/usr/bin/env tsx
/**
 * One-time migration: base64 image_url → Supabase Storage CDN URL
 *
 * Run from the backend directory:
 *   npx tsx scripts/migrate-images.ts
 */

import "../lib/loadEnv.js";
import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "../lib/supabase.js";

const BUCKET = "product-images";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return { mime: match[1]!, buffer: Buffer.from(match[2]!, "base64") };
}

async function uploadBuffer(buffer: Buffer, mime: string, storagePath: string): Promise<string> {
  const { error } = await supabaseAdmin!.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (error) throw new Error(error.message);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

// ── Per-table migration ───────────────────────────────────────────────────────

async function migrateTable(
  imgTable: "product_images" | "draft_product_images",
  parentTable: "products" | "draft_products",
  variantTable: "product_variants" | "draft_product_variants",
): Promise<void> {
  const sb = supabaseAdmin!;
  console.log(`\n── ${imgTable} ${"─".repeat(Math.max(0, 44 - imgTable.length))}`);

  // 1. Fetch all base64 rows
  const { data: images, error: imgErr } = await sb
    .from(imgTable)
    .select("id, image_url, product_id, variant_id")
    .like("image_url", "data:%");
  if (imgErr) throw imgErr;

  if (!images || images.length === 0) {
    console.log("  ✓ No base64 images — already migrated");
    return;
  }
  console.log(`  Found ${images.length} base64 image(s)`);

  // 2. product_id → base_sku map
  const productIds = [...new Set(images.map(i => i.product_id as string))];
  const { data: prods, error: prodErr } = await sb
    .from(parentTable)
    .select("id, base_sku")
    .in("id", productIds);
  if (prodErr) throw prodErr;
  const skuMap = new Map((prods ?? []).map(p => [p.id as string, p.base_sku as string]));

  // 3. variant_id → color_name map
  const variantIds = [...new Set(
    images.filter(i => i.variant_id).map(i => i.variant_id as string)
  )];
  const colorMap = new Map<string, string>();
  if (variantIds.length > 0) {
    const { data: vars, error: varErr } = await sb
      .from(variantTable)
      .select("id, color_name")
      .in("id", variantIds);
    if (varErr) throw varErr;
    (vars ?? []).forEach(v => colorMap.set(v.id as string, v.color_name as string));
  }

  // 4. Upload each and update DB row
  let ok = 0, fail = 0;
  for (const img of images) {
    const parsed = parseDataUrl(img.image_url as string);
    if (!parsed) {
      console.log(`  ⚠ ${img.id} — not a data URL, skipping`);
      fail++;
      continue;
    }

    const baseSku = skuMap.get(img.product_id as string) ?? "unknown";
    const colorName = img.variant_id ? (colorMap.get(img.variant_id as string) ?? "variant") : null;
    const context = colorName ? colorName.toLowerCase().replace(/\s+/g, "-") : "global";
    const ext = parsed.mime.includes("png") ? "png" : "jpg";
    const storagePath = `products/${baseSku}/${context}/${randomUUID()}.${ext}`;

    try {
      const publicUrl = await uploadBuffer(parsed.buffer, parsed.mime, storagePath);
      const { error: updErr } = await sb
        .from(imgTable)
        .update({ image_url: publicUrl })
        .eq("id", img.id);
      if (updErr) throw updErr;
      console.log(`  ✓ [${baseSku}/${context}] → ...${publicUrl.slice(-50)}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${img.id} — ${err instanceof Error ? err.message : err}`);
      fail++;
    }
  }

  console.log(`  Result: ${ok} migrated, ${fail} failed`);
}

// ── Entry ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!supabaseAdmin) {
    console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY not set — cannot run migration");
    process.exit(1);
  }

  if (!SUPABASE_URL) {
    console.error("ERROR: SUPABASE_URL not set");
    process.exit(1);
  }

  console.log("Image migration: base64 DB columns → Supabase Storage CDN URLs");
  console.log(`Bucket: ${BUCKET}  |  Project: ${SUPABASE_URL}`);

  // Ensure bucket exists
  const { error: bucketErr } = await supabaseAdmin.storage
    .createBucket(BUCKET, { public: true });
  if (bucketErr && !bucketErr.message.toLowerCase().includes("already exists")) {
    throw new Error(`Bucket creation failed: ${bucketErr.message}`);
  }

  await migrateTable("product_images", "products", "product_variants");
  await migrateTable("draft_product_images", "draft_products", "draft_product_variants");

  console.log("\n✓ Migration complete.");
}

main().catch((err) => { console.error(err); process.exit(1); });
