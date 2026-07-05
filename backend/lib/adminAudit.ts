import { supabaseAdmin } from "./supabase.js";

// The admin audit-log's action kinds. Unlike the customer activity_log (which is
// driven by DB triggers on source tables), every admin action is written from
// application code in the mutation route that performs it — there's no single
// source table to trigger off, and the acting admin's identity only exists on the
// request (req.userId), not in the row being changed.
export type AdminActionType =
  | "product_launched"
  | "product_draft_saved"
  | "product_deleted"
  | "coupon_created"
  | "coupon_updated"
  | "coupon_deleted"
  | "order_status_changed"
  | "payment_status_changed"
  | "curation_updated"
  | "curation_section_updated"
  | "admin_access_granted"
  | "admin_access_revoked"
  | "maintenance_enabled"
  | "maintenance_disabled"
  | "review_verified"
  | "review_unverified"
  | "review_deleted"
  | "dashboard_widget_hidden"
  | "dashboard_widget_shown"
  | "dashboard_widgets_reordered";

interface AdminActionEntry {
  // The acting admin (req.userId). NULLable only defensively — every call site is
  // behind requireAuth+requireAdmin, so it's virtually always set.
  adminId: string | null;
  action: AdminActionType;
  // What was acted on: 'product' | 'coupon' | 'order' | 'curation_section' |
  // 'admin_account' | 'site'. Free-text so new targets don't need a schema change.
  targetType?: string | null;
  // The natural id of the target (sku / coupon code / order id / section key /
  // email / "maintenance"). Text because it varies by target type.
  targetId?: string | null;
  // A human-readable one-liner captured AT WRITE TIME. The feed renders its own
  // richer sentence from action+metadata, but this is the durable fallback that
  // stays correct even if the metadata shape later drifts.
  summary: string;
  metadata?: Record<string, unknown>;
}

// Best-effort insert into admin_action_log. NEVER throws — an audit-logging failure
// must not affect the admin action that triggered it (the mutation already
// succeeded by the time we log). No-op when the service-role client is unset
// (admin_action_log is RLS-locked, so only the service role can write from app
// code) or the table doesn't exist yet (pre-migration).
export async function logAdminAction(entry: AdminActionEntry): Promise<void> {
  if (!supabaseAdmin) {
    console.warn(`[adminAudit] skip (${entry.action}) — no service-role client configured`);
    return;
  }
  try {
    const { error } = await supabaseAdmin.from("admin_action_log").insert({
      admin_id: entry.adminId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      summary: entry.summary,
      metadata: entry.metadata ?? {},
    });
    if (error) {
      console.warn(`[adminAudit] insert failed (${entry.action}): ${error.message}`);
      return;
    }
    console.log(`[adminAudit] logged ${entry.action}  admin=${entry.adminId ?? "unknown"}  target=${entry.targetId ?? "-"}`);
  } catch (e) {
    console.warn(`[adminAudit] threw (${entry.action}): ${e instanceof Error ? e.message : String(e)}`);
  }
}
