import { Router, type Request, type Response } from "express";
import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminMutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, type OpLogger } from "../lib/logger.js";
import { logAdminAction } from "../lib/adminAudit.js";

const router = Router();


// Same regex the backend uses elsewhere (auth.ts) and the DB mirrors in
// admin_set_account_admin — keep all three in sync.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirror of public.is_root_admin() — used ONLY to flag protected owners in the GET
// response. The database is the real enforcer (revoking a root is refused inside
// the RPC); this is purely for the UI to disable the button + show an "Owner" badge.
const ROOT_ADMIN_EMAILS = ["shahvanshm23.4.2004@gmail.com", "meghnashahm@gmail.com"];

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
const isRoot = (e: string | null | undefined) => ROOT_ADMIN_EMAILS.includes(norm(e));

// Every endpoint requires a valid token AND an admin role (server-side).
router.use(requireAuth, requireAdmin);

// Admin-account management writes profiles.role (role-locked) and the RLS-locked
// allowlist, and calls a service_role-only RPC. All of that REQUIRES the service
// role. The anon fallback would be rejected by the DB, so we fail loudly with a
// clear message instead of degrading into confusing 401/403/empty results.
function serviceClientOr503(res: Response, log: OpLogger): SupabaseClient | null {
  if (supabaseAdmin) return supabaseAdmin;
  log.error("SUPABASE_SERVICE_ROLE_KEY not configured — admin-access management unavailable").end("ADMIN ACCESS");
  res.status(503).json({
    error:
      "Admin management is unavailable: the backend is missing SUPABASE_SERVICE_ROLE_KEY. Set it in backend/.env and restart.",
  });
  return null;
}

// A PostgREST error meaning the RPC/table doesn't exist yet (migration not applied).
function isMissingObjectError(code?: string, message?: string): boolean {
  return (
    code === "42883" || // undefined_function
    code === "42P01" || // undefined_table
    code === "PGRST202" || // PostgREST: function not in schema cache
    code === "PGRST205" || // PostgREST: table not in schema cache
    /does not exist|find the (function|table)|schema cache/i.test(message ?? "")
  );
}

const MIGRATION_HINT =
  "Admin management isn't set up in the database yet. Run lil-edit/supabase/migrations/20260629_admin_email_allowlist.sql in Supabase.";

interface ProfileRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  created_at: string;
}

interface AllowRow {
  email: string;
  added_by_email: string | null;
  created_at: string;
}

// Human-readable result message keyed by the RPC's status enum.
function messageFor(status: string, email: string): string {
  switch (status) {
    case "granted":
      return `Admin access granted to ${email}.`;
    case "already_admin":
      return `${email} is already an admin.`;
    case "revoked":
      return `Admin access removed from ${email}.`;
    case "already_not_admin":
      return `${email} was not an admin.`;
    case "root_blocked":
      return "This is a protected owner account and can't be changed.";
    case "self_revoke_blocked":
      return "You can't remove your own admin access.";
    case "invalid_email":
      return "Enter a valid email address.";
    default:
      return "Done.";
  }
}

// ─── GET /api/admin/access — current admins + pending invites ─────────────────
router.get("/", async (req: Request, res: Response) => {
  const log = createLog().start("ADMIN ACCESS LIST");
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const actorId = (req as AuthenticatedRequest).userId;

  try {
    const [adminsRes, allowRes] = await Promise.all([
      db
        .from("profiles")
        .select("id, email, first_name, last_name, role, created_at")
        .eq("role", "admin")
        .order("created_at", { ascending: true }),
      db
        .from("admin_email_allowlist")
        .select("email, added_by_email, created_at")
        .order("created_at", { ascending: true }),
    ]);

    if (adminsRes.error) {
      log.error(`profiles query failed  code=${adminsRes.error.code}  msg=${adminsRes.error.message}`, adminsRes.error).end("ADMIN ACCESS LIST");
      res.status(500).json({ error: adminsRes.error.message });
      return;
    }
    if (allowRes.error) {
      // The allowlist table is the new piece — a missing-table error here means the
      // migration hasn't been applied. Surface the actionable hint.
      if (isMissingObjectError((allowRes.error as { code?: string }).code, allowRes.error.message)) {
        log.warn("allowlist table missing — migration not applied").end("ADMIN ACCESS LIST");
        res.status(503).json({ error: MIGRATION_HINT });
        return;
      }
      log.error(`allowlist query failed  code=${allowRes.error.code}  msg=${allowRes.error.message}`, allowRes.error).end("ADMIN ACCESS LIST");
      res.status(500).json({ error: allowRes.error.message });
      return;
    }

    const adminRows = (adminsRes.data ?? []) as ProfileRow[];
    const allowRows = (allowRes.data ?? []) as AllowRow[];

    const adminEmailSet = new Set(adminRows.map((r) => norm(r.email)));

    // Active admins = real profile rows with role=admin.
    const admins = adminRows.map((r) => ({
      id: r.id,
      email: r.email ?? "",
      firstName: r.first_name,
      lastName: r.last_name,
      isRoot: isRoot(r.email),
      isSelf: r.id === actorId,
      accountExists: true,
    }));

    // Surface owner accounts that haven't signed up yet so the protected set is
    // never invisible. They auto-promote on signup via is_root_admin().
    for (const email of ROOT_ADMIN_EMAILS) {
      if (!adminEmailSet.has(norm(email))) {
        admins.push({
          id: null as unknown as string,
          email,
          firstName: null,
          lastName: null,
          isRoot: true,
          isSelf: false,
          accountExists: false,
        });
      }
    }

    // Pending = allowlisted emails that are not (yet) an active admin. Covers
    // "no account yet" — the not-yet-registered case the UI is built around.
    const pending = allowRows
      .filter((r) => !adminEmailSet.has(norm(r.email)) && !isRoot(r.email))
      .map((r) => ({
        email: r.email,
        addedByEmail: r.added_by_email,
        createdAt: r.created_at,
      }));

    log.success(`served  admins=${admins.length}  pending=${pending.length}`).end("ADMIN ACCESS LIST");
    res.json({ admins, pending });
  } catch (err) {
    log.error("unhandled error", err).end("ADMIN ACCESS LIST");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

interface RpcResult {
  status: string;
  email: string;
  profileExists: boolean;
  role: string | null;
}

// Shared grant/revoke handler — both call the same atomic RPC, differing only by
// the make-admin flag and which statuses count as a client error.
async function mutateAccess(req: Request, res: Response, makeAdmin: boolean): Promise<void> {
  const label = makeAdmin ? "ADMIN ACCESS GRANT" : "ADMIN ACCESS REVOKE";
  const log = createLog().start(label);
  const db = serviceClientOr503(res, log);
  if (!db) return;
  const actorId = (req as AuthenticatedRequest).userId;

  const email = String((req.body as { email?: unknown })?.email ?? "").trim();
  log.step(`actor=${actorId}  ${makeAdmin ? "grant" : "revoke"}  email="${email}"`);

  // Client-side-shape validation first (the DB validates again).
  if (!email || !EMAIL_RE.test(email)) {
    log.warn(`invalid email="${email}"`).end(label);
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  try {
    const { data, error } = await db.rpc("admin_set_account_admin", {
      p_email: email,
      p_make_admin: makeAdmin,
      p_actor_id: actorId,
    });

    if (error) {
      if (isMissingObjectError((error as { code?: string }).code, error.message)) {
        log.warn("RPC missing — migration not applied").end(label);
        res.status(503).json({ error: MIGRATION_HINT });
        return;
      }
      log.error(`rpc failed  code=${error.code}  msg=${error.message}`, error).end(label);
      res.status(500).json({ error: error.message });
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as RpcResult | null;
    if (!result || !result.status) {
      log.error("rpc returned no status").end(label);
      res.status(500).json({ error: "Unexpected response from the database." });
      return;
    }

    const normalizedEmail = result.email || email.toLowerCase();
    const message = messageFor(result.status, normalizedEmail);

    // Map the DB's refusals to 400 so the UI shows them as errors, not successes.
    const clientErrorStatuses = new Set([
      "invalid_email",
      "self_revoke_blocked",
    ]);
    if (clientErrorStatuses.has(result.status)) {
      log.warn(`refused  status=${result.status}  email=${normalizedEmail}`).end(label);
      res.status(400).json({ error: message, status: result.status });
      return;
    }

    log.success(`ok  status=${result.status}  email=${normalizedEmail}  accountExists=${result.profileExists}`).end(label);
    // Only audit a real state change — the idempotent no-ops (already_admin /
    // already_not_admin) and blocked cases aren't actions worth a trail entry.
    if (result.status === "granted" || result.status === "revoked") {
      void logAdminAction({
        adminId: actorId,
        action: makeAdmin ? "admin_access_granted" : "admin_access_revoked",
        targetType: "admin_account",
        targetId: normalizedEmail,
        summary: makeAdmin
          ? `Granted admin access to ${normalizedEmail}`
          : `Revoked admin access from ${normalizedEmail}`,
        metadata: { email: normalizedEmail, accountExists: result.profileExists },
      });
    }
    res.json({
      status: result.status,
      email: normalizedEmail,
      profileExists: result.profileExists,
      role: result.role,
      message,
    });
  } catch (err) {
    log.error("unhandled error", err).end(label);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

// ─── POST /api/admin/access/grant ─────────────────────────────────────────────
router.post("/grant", adminMutationLimiter, (req, res) => void mutateAccess(req, res, true));

// ─── POST /api/admin/access/revoke ────────────────────────────────────────────
router.post("/revoke", adminMutationLimiter, (req, res) => void mutateAccess(req, res, false));

export default router;
