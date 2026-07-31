import express from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { createLog } from "../lib/logger.js";
import { authLimiter, otpSendLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

function isMissingRpcError(message: string | undefined, code?: string) {
  if (!message) return false;
  return (
    message.includes("does not exist") ||
    message.includes("Could not find the function") ||
    code === "PGRST202" ||
    code === "42883"
  );
}

/**
 * Signup step 1: server checks email not already registered in profiles,
 * then triggers Supabase email OTP.
 *
 * Rate limited two ways: authLimiter caps attempts per IP (bulk abuse from one
 * source), otpSendLimiter caps sends per email address (bombing one inbox from
 * many sources). Both sit in front of the handler so a throttled request never
 * reaches Supabase.
 */
router.post("/signup/send-otp", authLimiter, otpSendLimiter, async (req, res) => {
  const log = createLog().start("AUTH SIGNUP OTP");
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      log.warn("invalid or missing email").end("AUTH SIGNUP OTP");
      res.status(400).json({ error: "Valid email is required" });
      return;
    }

    log.step(`email=${email}`);

    if (supabaseAdmin) {
      log.step("DB check - email availability via admin client");
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();

      if (error) {
        log.error("profile lookup failed", error).end("AUTH SIGNUP OTP");
        res.status(500).json({ error: "Could not verify email availability" });
        return;
      }

      if (data) {
        log.warn(`email already registered  email=${email}`).end("AUTH SIGNUP OTP");
        res.status(409).json({ error: "This email is already registered. Please log in instead." });
        return;
      }
    } else {
      log.step("DB check - email availability via RPC");
      const { data: alreadyRegistered, error: rpcError } = await supabaseAnon.rpc(
        "is_profile_registered",
        { p_email: email },
      );

      if (rpcError) {
        if (isMissingRpcError(rpcError.message, (rpcError as { code?: string }).code)) {
          log.error("is_profile_registered RPC missing — run lil-edit/supabase/sql/create_profiles.sql");
          res.status(500).json({ error: "Could not verify email availability" });
          log.end("AUTH SIGNUP OTP");
          return;
        }
        log.error("RPC error", rpcError).end("AUTH SIGNUP OTP");
        res.status(500).json({ error: "Could not verify email availability" });
        return;
      }

      if (alreadyRegistered === true) {
        log.warn(`email already registered  email=${email}`).end("AUTH SIGNUP OTP");
        res.status(409).json({ error: "This email is already registered. Please log in instead." });
        return;
      }
    }

    log.step("Supabase Auth - send OTP");
    const { error: otpError } = await supabaseAnon.auth.signInWithOtp({ email });
    if (otpError) {
      log.error("OTP send failed", otpError).end("AUTH SIGNUP OTP");
      res.status(400).json({ error: otpError.message });
      return;
    }

    log.success(`OTP sent  email=${email}`).end("AUTH SIGNUP OTP");
    res.status(200).json({ ok: true });
  } catch (e) {
    log.error("unhandled error", e).end("AUTH SIGNUP OTP");
    res.status(500).json({ error: "Internal server error" });
  }
});

// NOTE: There is deliberately no "does this email have an account?" endpoint.
// Login and password-reset run straight against Supabase and return a generic
// result, so neither the API nor its error messages reveal whether an address is
// registered (account enumeration). Signup still reports "already registered"
// because it genuinely can't create a duplicate — that's the one unavoidable
// disclosure, and it's rate limited above.

export default router;
