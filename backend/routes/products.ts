import { Router, type Request, type Response } from "express";
import {
  fetchAllProducts,
  isSupabaseCatalogConfigured,
  launchProductToDatabase,
  saveDraftToDatabase,
  deleteProductFromDatabase
} from "../lib/persistCatalog.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const products = await fetchAllProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

interface StoredProduct {
  status: "DRAFT" | "PUBLISHED";
  receivedAt: string;
  data: Record<string, unknown>;
}

let lastProduct: StoredProduct | null = null;

function buildPublicPayload(): Record<string, unknown> | null {
  if (!lastProduct) return null;
  return { status: lastProduct.status, receivedAt: lastProduct.receivedAt, ...lastProduct.data };
}

// POST /api/products/preview — Curation Studio + optional Supabase persistence
router.post("/preview", async (req: Request, res: Response) => {
  const { status, ...data } = req.body as { status: string; [key: string]: unknown };

  const normalized: "DRAFT" | "PUBLISHED" = status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";

  lastProduct = {
    status: normalized,
    receivedAt: new Date().toISOString(),
    data,
  };

  console.log(
    `\n[Products] Received ${lastProduct.status}: "${(data as { name?: string }).name ?? "Untitled"}"\n`
  );

  const previewPath = "/api/products/preview";
  const payload = buildPublicPayload();

  let database:
    | { ok: true; draftProductId?: string; publishedProductId?: string }
    | { ok: false; skipped: true; reason: string }
    | { ok: false; error: string } = { ok: false, skipped: true, reason: "not_configured" };

  if (isSupabaseCatalogConfigured()) {
    try {
      if (normalized === "DRAFT") {
        const { draftProductId } = await saveDraftToDatabase(data);
        database = { ok: true, draftProductId };
      } else {
        const { publishedProductId } = await launchProductToDatabase(data);
        database = { ok: true, publishedProductId };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Products] Supabase persist failed:", message);
      database = { ok: false, error: message };
      res.status(500).json({
        ok: false,
        status: normalized,
        previewPath,
        payload,
        database,
      });
      return;
    }
  } else {
    database = {
      ok: false,
      skipped: true,
      reason:
        "Set SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_SERVICE_KEY) in backend/.env to persist drafts and launches.",
    };
  }

  res.json({
    ok: true,
    status: lastProduct.status,
    previewPath,
    payload,
    database,
  });
});

router.get("/preview", (_req: Request, res: Response) => {
  const payload = buildPublicPayload();
  if (!payload) {
    res.json({
      message:
        "No product received yet. Use Save Draft or Launch Product in the Curation Studio first.",
    });
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json(payload);
});

// DELETE /api/products/:id?status=DRAFT|PUBLISHED
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const status = req.query.status as string;

  if (status !== "DRAFT" && status !== "PUBLISHED") {
    res.status(400).json({ error: "Invalid or missing status query parameter. Must be DRAFT or PUBLISHED." });
    return;
  }

  if (!isSupabaseCatalogConfigured()) {
    res.status(503).json({ error: "Supabase is not configured." });
    return;
  }

  try {
    await deleteProductFromDatabase(id, status);
    res.json({ success: true, message: `Successfully deleted ${status} product ${id}.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Products] Delete failed for ${id}:`, message);
    res.status(500).json({ error: message });
  }
});

export default router;
