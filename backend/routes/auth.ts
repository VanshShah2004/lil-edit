import express from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";

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
 * then triggers Supabase email OTP. Client still calls verifyOtp + updateUser.
 */
router.post("/signup/send-otp", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();

      if (error) {
        console.error(error);
        res.status(500).json({ error: "Could not verify email availability" });
        return;
      }

      if (data) {
        res.status(409).json({
          error: "This email is already registered. Please log in instead.",
        });
        return;
      }
    } else {
      const { data: alreadyRegistered, error: rpcError } = await supabaseAnon.rpc(
        "is_profile_registered",
        { p_email: email }
      );

      if (rpcError) {
        if (isMissingRpcError(rpcError.message, (rpcError as { code?: string }).code)) {
          console.error(
            "[auth] is_profile_registered RPC missing — run lil-edit/supabase/sql/create_profiles.sql."
          );
          res.status(500).json({ error: "Could not verify email availability" });
          return;
        }
        console.error(rpcError);
        res.status(500).json({ error: "Could not verify email availability" });
        return;
      }

      if (alreadyRegistered === true) {
        res.status(409).json({
          error: "This email is already registered. Please log in instead.",
        });
        return;
      }
    }

    const { error: otpError } = await supabaseAnon.auth.signInWithOtp({ email });
    if (otpError) {
      console.error(otpError);
      res.status(400).json({ error: otpError.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Login guard: require a profile row before attempting password auth.
 */
router.post("/login/check-profile", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();

      if (error) {
        console.error(error);
        res.status(500).json({ error: "Could not verify registration status" });
        return;
      }

      res.status(200).json({ exists: Boolean(data) });
      return;
    }

    const { data, error } = await supabaseAnon.rpc("is_profile_registered", {
      p_email: email,
    });

    if (error) {
      if (isMissingRpcError(error.message, (error as { code?: string }).code)) {
        console.warn(
          "[auth] is_profile_registered RPC missing — run the profiles SQL setup to enable pre-login profile checks."
        );
      } else {
        console.error(error);
        res.status(500).json({ error: "Could not verify registration status" });
        return;
      }
    }

    res.status(200).json({ exists: data === true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
