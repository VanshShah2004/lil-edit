import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { getMaintenanceSnapshot } from "../lib/maintenance.js";
import { createLog } from "../lib/logger.js";

/**
 * Global maintenance lockdown. Mounted in server.ts AFTER the body parser +
 * global limiter and AFTER the /api/auth and /api/maintenance routers (so those
 * always work), but BEFORE every customer-facing router.
 *
 * When maintenance is OFF (the normal case) this is a single synchronous boolean
 * read and an immediate next() — zero added latency on the hot path.
 *
 * When maintenance is ON it is the airtight backstop behind the frontend's
 * coming-soon page: every /api request is refused with 503 EXCEPT those from a
 * verified admin (so admins keep full access and can flip the switch back). The
 * SPA shell, static assets, /share and /healthz are not under /api and pass
 * through so the browser can load and render the coming-soon page.
 */

// Belt-and-suspenders: these must never be gated even if their routers were ever
// re-mounted below this middleware. /api/auth → admins must be able to log in;
// /api/maintenance → public status + the admin toggle that turns the site back on.
function isAlwaysAllowed(path: string): boolean {
  return path.startsWith("/api/auth") || path.startsWith("/api/maintenance");
}

// Resolve whether the request carries a valid ADMIN token. Mirrors
// requireAuth + requireAdmin, collapsed into one boolean and hardened to never
// throw (a maintenance-time auth hiccup must not 500 the gate).
async function callerIsAdmin(req: Request): Promise<boolean> {
  const header = req.headers.authorization;
  // No token → definitely not an admin. Skip the auth round-trip entirely so
  // anonymous traffic during maintenance is rejected cheaply.
  if (!header?.startsWith("Bearer ")) return false;

  const token = header.slice(7);
  const client = supabaseAdmin ?? supabaseAnon;
  try {
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return false;

    const { data, error: roleErr } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (roleErr) return false;

    return data?.role === "admin";
  } catch {
    return false;
  }
}

export async function maintenanceGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // HOT PATH — site is live. One boolean read, then out of the way.
  if (!getMaintenanceSnapshot().active) {
    next();
    return;
  }

  // Non-/api paths (SPA HTML, hashed assets, /share, /healthz) must load so the
  // browser can render the coming-soon page and health checks keep working.
  if (!req.path.startsWith("/api")) {
    next();
    return;
  }

  if (isAlwaysAllowed(req.path)) {
    next();
    return;
  }

  // Full lockdown for every other /api route: admins pass, everyone else 503s.
  const log = createLog().start("MAINTENANCE GATE");
  log.step(`${req.method} ${req.originalUrl}  (maintenance ON)`);

  if (await callerIsAdmin(req)) {
    log.success("admin bypass — allowed").end("MAINTENANCE GATE");
    next();
    return;
  }

  log.warn("DENY - non-admin blocked while under maintenance (503)").end("MAINTENANCE GATE");
  res.status(503).json({
    error: "The store is offline for a short while. Please check back soon.",
    maintenance: true,
    message: getMaintenanceSnapshot().message ?? null,
  });
}
