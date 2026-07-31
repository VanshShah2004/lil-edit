import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { createLog } from "../lib/logger.js";
import { type AuthenticatedRequest } from "./requireAuth.js";

/**
 * Authorization guard — must run AFTER requireAuth (which validates the JWT and
 * sets req.userId). Looks up the caller's role from `profiles` via the
 * service-role client and rejects non-admins.
 *
 * profiles.role is locked at the database level so it cannot be self-assigned —
 * see lil-edit/supabase/sql/secure_profile_role.sql. Without that lock this
 * check would be forgeable (a user could promote their own row to admin), so the
 * two changes must be deployed together.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const log = createLog().start("AUTH ADMIN CHECK");
  const userId = (req as AuthenticatedRequest).userId;
  log.step(`${req.method} ${req.originalUrl}  user=${userId ?? "none"}`);

  if (!userId) {
    log.warn("DENY - no userId on request (requireAuth must run first)").end("AUTH ADMIN CHECK");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const client = supabaseAdmin ?? supabaseAnon;
  log.step(`DB lookup - profiles.role  client=${supabaseAdmin ? "admin" : "anon"}`);
  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    log.error(`role lookup failed  code=${(error as { code?: string }).code ?? "?"}  msg=${error.message}`, error).end("AUTH ADMIN CHECK");
    res.status(500).json({ error: "Could not verify admin status" });
    return;
  }

  if (!data || data.role !== "admin") {
    log.warn(`DENY - not an admin  role=${data?.role ?? "no profile row"}  required=admin`).end("AUTH ADMIN CHECK");
    res.status(403).json({ error: "Forbidden — admin access required" });
    return;
  }

  log.success(`ALLOW - admin verified  user=${userId}  role=admin`).end("AUTH ADMIN CHECK");
  next();
}
