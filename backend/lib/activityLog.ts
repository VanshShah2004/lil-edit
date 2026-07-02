import { type Request } from "express";
import { supabaseAdmin, supabaseAnon } from "./supabase.js";

// The activity feed's event kinds. cart_add / wishlist_add / order_placed /
// review_submitted are written by DB triggers (see 20260702_activity_log.sql);
// 'search' is the only one written from application code (there is no source row
// to trigger off — a search is a read, not a write).
export type ActivityType =
  | "cart_add"
  | "wishlist_add"
  | "order_placed"
  | "review_submitted"
  | "search";

interface ActivityEntry {
  userId: string | null;
  type: ActivityType;
  productSlug?: string | null;
  sku?: string | null;
  metadata?: Record<string, unknown>;
}

// Best-effort insert into activity_log. NEVER throws — a logging failure must not
// affect the request that triggered it. No-op when the service-role client is
// unset (activity_log is RLS-locked, so only service role can write from app
// code) or the table doesn't exist yet (pre-migration).
export async function logActivity(entry: ActivityEntry): Promise<void> {
  if (!supabaseAdmin) {
    console.warn(`[activityLog] skip (${entry.type}) — no service-role client configured`);
    return;
  }
  try {
    const { error } = await supabaseAdmin.from("activity_log").insert({
      user_id: entry.userId,
      type: entry.type,
      product_slug: entry.productSlug ?? null,
      sku: entry.sku ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) {
      console.warn(`[activityLog] insert failed (${entry.type}): ${error.message}`);
      return;
    }
    console.log(`[activityLog] logged ${entry.type}  user=${entry.userId ?? "guest"}`);
  } catch (e) {
    console.warn(`[activityLog] threw (${entry.type}): ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Best-effort user attribution for public endpoints that don't run requireAuth
// (the search route is hit by anonymous visitors too). Decodes the Bearer token
// if present; returns null when it's absent or invalid. NEVER throws. Intended to
// be called off the request's hot path (fire-and-forget) so the token round-trip
// doesn't add latency to the response.
export async function optionalUserId(req: Request): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const client = supabaseAdmin ?? supabaseAnon;
  try {
    const { data, error } = await client.auth.getUser(header.slice(7));
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
