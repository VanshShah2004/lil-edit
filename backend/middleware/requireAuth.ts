import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";

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
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized — missing Bearer token" });
    return;
  }

  const token = header.slice(7);
  const client = supabaseAdmin ?? supabaseAnon;

  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: "Unauthorized — invalid or expired token" });
    return;
  }

  (req as AuthenticatedRequest).userId = user.id;
  next();
}
