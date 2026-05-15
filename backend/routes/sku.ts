import { Router, type Request, type Response } from "express";
import { SKUCounterService } from "../services/skuCounterService.js";

const router = Router();

/**
 * GET /api/sku/generate
 * Generates the next SKU for a given category and gender.
 * Reserves the number in the database.
 */
router.get("/generate", async (req: Request, res: Response) => {
  const { category, gender } = req.query;

  if (!category || !gender) {
    res.status(400).json({ error: "Category and Gender are required." });
    return;
  }

  try {
    const sku = await SKUCounterService.generateNextSKU(String(category), String(gender));
    res.json({ sku });
  } catch (error) {
    console.error("[SKU Route] Generation failed:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

/**
 * GET /api/sku/validate
 * Validates if a SKU is unique.
 */
router.get("/validate", async (req: Request, res: Response) => {
  const { sku } = req.query;

  if (!sku) {
    res.status(400).json({ error: "SKU is required." });
    return;
  }

  try {
    const isUnique = await SKUCounterService.isSKUUnique(String(sku));
    res.json({ isUnique });
  } catch (error) {
    res.status(500).json({ error: "Validation failed." });
  }
});

export default router;
