import express from "express";
import { supabaseAnon } from "../lib/supabase";

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
 * Signup step 1: server checks email not already registered (via DB RPC),
 * then triggers Supabase email OTP. Client still calls verifyOtp + updateUser.
 */
router.post("/signup/send-otp", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }

    const clientForRpc = supabaseAnon;
    const { data: alreadyRegistered, error: rpcError } = await clientForRpc.rpc(
      "is_email_registered",
      { p_email: email }
    );

    if (rpcError) {
      if (isMissingRpcError(rpcError.message, (rpcError as { code?: string }).code)) {
        console.warn(
          "[auth] is_email_registered RPC missing — run lil-edit/supabase/sql/is_email_registered.sql; duplicate check skipped."
        );
      } else {
        console.error(rpcError);
        res.status(500).json({ error: "Could not verify email availability" });
        return;
      }
    } else if (alreadyRegistered === true) {
      res.status(409).json({
        error: "This email is already registered. Please log in instead.",
      });
      return;
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

export default router;
