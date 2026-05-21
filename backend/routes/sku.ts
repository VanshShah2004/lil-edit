import { Router, type Request, type Response } from "express";
import { SKUCounterService } from "../services/skuCounterService.js";
import { createLog } from "../lib/logger.js";

const router = Router();

router.get("/generate", async (req: Request, res: Response) => {
  const log = createLog().start("SKU GENERATE");
  const { category, gender } = req.query;

  if (!category || !gender) {
    log.warn("Missing category or gender").end("SKU GENERATE");
    res.status(400).json({ error: "Category and Gender are required." });
    return;
  }

  log.step(`category=${category}  gender=${gender}`);

  try {
    const sku = await SKUCounterService.generateNextSKU(String(category), String(gender), log);
    log.success(`sku=${sku}`).end("SKU GENERATE");
    res.json({ sku });
  } catch (error) {
    log.error("generation failed", error).end("SKU GENERATE");
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

router.get("/validate", async (req: Request, res: Response) => {
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
