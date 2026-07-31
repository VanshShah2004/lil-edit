import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { createLog } from "../lib/logger.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

/**
 * Validates the Supabase JWT from the Authorization: Bearer header.
 * Attaches the authenticated user's ID to req.userId on success.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const log = createLog().start("AUTH TOKEN CHECK");
  log.step(`${req.method} ${req.originalUrl}`);

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    log.warn("DENY - missing Bearer token").end("AUTH TOKEN CHECK");
    res.status(401).json({ error: "Unauthorized — missing Bearer token" });
    return;
  }

  const token = header.slice(7);
  const client = supabaseAdmin ?? supabaseAnon;
  log.step(`validating token  client=${supabaseAdmin ? "admin" : "anon"}  token=…${token.slice(-6)}`);

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    log.warn(`DENY - invalid/expired token  ${error?.message ?? "no user returned"}`).end("AUTH TOKEN CHECK");
    res.status(401).json({ error: "Unauthorized — invalid or expired token" });
    return;
  }

  (req as AuthenticatedRequest).userId = user.id;
  log.success(`OK - token valid  user=${user.id}`).end("AUTH TOKEN CHECK");
  next();
}
