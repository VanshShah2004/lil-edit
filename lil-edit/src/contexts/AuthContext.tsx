import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

/**
 * Auth architecture (frontend ↔ API ↔ Supabase, same project everywhere):
 * - Session, sign-in/out, OTP verify, password + user metadata: `@/lib/supabase` (browser).
 * - Signup “send OTP”: Express `POST /api/auth/signup/send-otp` when `VITE_API_URL` is set, or in dev
 *   default `http://localhost:5000`; if no API base URL (e.g. prod without `VITE_API_URL`), same logic
 *   runs via `supabase.rpc` + `signInWithOtp` in the browser instead.
 */

interface CompleteSignupPayload {
  email: string;
  otp: string;
  password: string;
  first_name: string;
  last_name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendSignupOtp: (email: string) => Promise<void>;
  sendPasswordResetOtp: (email: string) => Promise<void>;
  verifySignupOtpAndCompleteProfile: (payload: CompleteSignupPayload) => Promise<void>;
  verifyPasswordResetOtpAndUpdatePassword: (payload: {
    email: string;
    otp: string;
    newPassword: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return "http://localhost:5000";
  return "";
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const sendSignupOtp = async (email: string) => {
    const normalized = email.trim();
    const apiBase = getApiBaseUrl();

    if (apiBase) {
      try {
        const res = await fetch(`${apiBase}/api/auth/signup/send-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalized }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : `Could not send OTP (${res.status})`
          );
        }
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error(
            "Cannot reach the API. Start the backend in a separate terminal: npm run dev:api from the repo root (or npm run dev in backend/)."
          );
        }
        throw e;
      }
      return;
    }

    const { data: alreadyRegistered, error: rpcError } = await supabase.rpc("is_email_registered", {
      p_email: normalized,
    });

    if (rpcError) {
      const msg = rpcError.message ?? "";
      const missingFn =
        msg.includes("does not exist") ||
        msg.includes("Could not find the function") ||
        (rpcError as { code?: string }).code === "PGRST202";
      if (missingFn) {
        console.warn(
          "[auth] is_email_registered RPC missing — run supabase/sql/is_email_registered.sql in SQL Editor; duplicate email check skipped."
        );
      } else {
        throw rpcError;
      }
    } else if (alreadyRegistered === true) {
      throw new Error("This email is already registered. Please log in instead.");
    }
  };

  const signInWithGoogle = async () => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) throw error;
  };

  const sendPasswordResetOtp = async (email: string) => {
    const normalized = email.trim();
    if (!normalized) throw new Error("Email is required");

    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) throw error;
  };

  const verifySignupOtpAndCompleteProfile = async ({
    email,
    otp,
    password,
    first_name,
    last_name,
  }: CompleteSignupPayload) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error) throw error;
    if (!data.session) {
      throw new Error("OTP verified but session not created. Please try again.");
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: {
        first_name,
        last_name,
      },
    });

    if (updateError) {
      throw new Error("Login succeeded, but profile setup failed. Please retry setting password.");
    }
  };

  const verifyPasswordResetOtpAndUpdatePassword = async ({
    email,
    otp,
    newPassword,
  }: {
    email: string;
    otp: string;
    newPassword: string;
  }) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    if (error) throw error;
    if (!data.session) {
      throw new Error("OTP verified but session not created. Please try again.");
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) throw updateError;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signInWithGoogle,
        sendSignupOtp,
        sendPasswordResetOtp,
        verifySignupOtpAndCompleteProfile,
        verifyPasswordResetOtpAndUpdatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};