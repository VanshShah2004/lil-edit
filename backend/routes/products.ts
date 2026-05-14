import { Router, type Request, type Response } from "express";

const router = Router();

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

// POST /api/products/preview — Curation Studio submits product JSON
router.post("/preview", (req: Request, res: Response) => {
  const { status, ...data } = req.body as { status: string; [key: string]: unknown };

  lastProduct = {
    status: status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    receivedAt: new Date().toISOString(),
    data,
  };

  console.log(
    `\n[Products] Received ${lastProduct.status}: "${(data as { name?: string }).name ?? "Untitled"}"\n`
  );

  const previewPath = "/api/products/preview";
  const payload = buildPublicPayload();
  res.json({ ok: true, status: lastProduct.status, previewPath, payload });
});

// GET /api/products/preview — raw JSON only (browser / curl)
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

export default router;
