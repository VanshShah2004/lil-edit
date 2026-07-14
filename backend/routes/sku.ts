import { Router, type Request, type Response } from "express";
import { SKUCounterService } from "../services/skuCounterService.js";
import { createLog } from "../lib/logger.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

// Read-only preview for the Add Product form. Reserving the number (the
// counter increment) happens on the save path (/api/products/preview) so
// browsing category/gender combos without saving never burns SKUs.
router.get("/generate", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const log = createLog().start("SKU PEEK");
  const { category, gender } = req.query;

  if (!category || !gender) {
    log.warn("Missing category or gender").end("SKU PEEK");
    res.status(400).json({ error: "Category and Gender are required." });
    return;
  }

  log.step(`category=${category}  gender=${gender}`);

  try {
    const sku = await SKUCounterService.peekNextSKU(String(category), String(gender), log);
    log.success(`sku=${sku} (preview only, not reserved)`).end("SKU PEEK");
    res.json({ sku });
  } catch (error) {
    log.error("peek failed", error).end("SKU PEEK");
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

router.get("/validate", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const log = createLog().start("SKU VALIDATE");
  const { sku } = req.query;

  if (!sku) {
    log.warn("Missing sku").end("SKU VALIDATE");
    res.status(400).json({ error: "SKU is required." });
    return;
  }

  log.step(`sku=${sku}`);

  try {
    const isUnique = await SKUCounterService.isSKUUnique(String(sku), log);
    log.success(`sku=${sku}  isUnique=${isUnique}`).end("SKU VALIDATE");
    res.json({ isUnique });
  } catch (error) {
    log.error("validation failed", error).end("SKU VALIDATE");
    res.status(500).json({ error: "Validation failed." });
  }
});

export default router;
