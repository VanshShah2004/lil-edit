import { Router, type Request, type Response } from "express";
import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminMutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, type OpLogger } from "../lib/logger.js";
import { logAdminAction } from "../lib/adminAudit.js";

const router = Router();
router.use(requireAuth, requireAdmin);

function serviceClientOr503(res: Response, log: OpLogger): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  log.error("SUPABASE_SERVICE_ROLE_KEY not configured").end("ADMIN REVIEWS");
  res.status(503).json({ error: "Review management unavailable: missing SUPABASE_SERVICE_ROLE_KEY." });
  return null;
}

function isMissingTable(code?: string, message?: string): boolean {
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist|find the table|schema cache/i.test(message ?? "")
  );
}

function sendDbError(res: Response, log: OpLogger, label: string, error: { code?: string; message: string }): void {
  if (isMissingTable(error.code, error.message)) {
    log.warn("product_reviews table missing — migration not applied").end(label);
    res.status(503).json({ error: "Reviews aren't set up in the database yet." });
    return;
  }
  log.error(`code=${error.code}  ${error.message}`, error).end(label);
  res.status(500).json({ error: error.message });
}

// ─── GET / — list all reviews, newest first ───────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  const log = createLog().start("ADMIN REVIEWS LIST");
  const db = serviceClientOr503(res, log);
  if (!db) return;

  const { data, error } = await db
    .from("product_reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    sendDbError(res, log, "ADMIN REVIEWS LIST", error);
    return;
  }
  log.success(`served ${data?.length ?? 0} reviews`).end("ADMIN REVIEWS LIST");
  res.json({ reviews: data ?? [] });
});

// ─── PATCH /:id/verify — set verified true/false ─────────────────────────────
router.patch("/:id/verify", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN REVIEW VERIFY");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const { id } = req.params as { id: string };
  const actorId = (req as AuthenticatedRequest).userId;
  const verified = Boolean((req.body as { verified?: unknown }).verified);

  const { data, error } = await db
    .from("product_reviews")
    .update({ verified })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    sendDbError(res, log, "ADMIN REVIEW VERIFY", error);
    return;
  }
  log.success(`review ${id} verified=${verified}`).end("ADMIN REVIEW VERIFY");
  void logAdminAction({
    adminId: actorId,
    action: verified ? "review_verified" : "review_unverified",
    targetType: "review",
    targetId: id,
    summary: `${verified ? "Verified" : "Unverified"} review on ${data.product_slug}`,
    metadata: { reviewId: id, productSlug: data.product_slug, sku: data.sku },
  });
  res.json({ review: data });
});

// ─── DELETE /:id — remove a review ────────────────────────────────────────────
router.delete("/:id", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN REVIEW DELETE");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const { id } = req.params as { id: string };
  const actorId = (req as AuthenticatedRequest).userId;

  const { data: existing } = await db
    .from("product_reviews")
    .select("product_slug, sku")
    .eq("id", id)
    .maybeSingle();

  const { error } = await db.from("product_reviews").delete().eq("id", id);
  if (error) {
    sendDbError(res, log, "ADMIN REVIEW DELETE", error);
    return;
  }
  log.success(`deleted review ${id}`).end("ADMIN REVIEW DELETE");
  void logAdminAction({
    adminId: actorId,
    action: "review_deleted",
    targetType: "review",
    targetId: id,
    summary: `Deleted review on ${existing?.product_slug ?? id}`,
    metadata: { reviewId: id, productSlug: existing?.product_slug ?? null, sku: existing?.sku ?? null },
  });
  res.status(204).send();
});

export default router;
