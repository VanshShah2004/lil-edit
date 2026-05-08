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

interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "customer";
  phone_number: string | null;
  is_phone_number_verified: boolean | null;
  dob: string | null;
  gender: "male" | "female" | "other" | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
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

function isMissingRpcError(message: string | undefined, code?: string) {
  if (!message) return false;
  return (
    message.includes("does not exist") ||
    message.includes("Could not find the function") ||
    code === "PGRST202" ||
    code === "42883"
  );
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (!error && data) {
      setProfile({
        id: data.id,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role,
        phone_number: data.phone_number,
        is_phone_number_verified: data.is_phone_number_verified,
        dob: data.dob,
        gender: data.gender,
      } as Profile);
    }
  };

  const loadProfileInBackground = (userId: string) => {
    void fetchProfile(userId).catch((err) =>
      console.error("Profile fetch failed:", err)
    );
  };

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Auth session error:", error.message);
          return;
        }
        const currentUser = data.session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          // Never block auth resolution on profiles row (RLS/network can hang or be slow).
          loadProfileInBackground(currentUser.id);
        }
      } catch (err) {
        console.error("Session fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      try {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setLoading(false);
        if (currentUser) {
          loadProfileInBackground(currentUser.id);
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Auth state change error:", err);
        setLoading(false);
      }
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
    // Fallback path: call Supabase directly from the browser (no backend API).
    if (!normalized) {
      throw new Error("Email is required");
    }

    // Best-effort duplicate email check using profiles as the source of truth.
    try {
      const { data: alreadyRegistered, error: rpcError } = await supabase.rpc("is_profile_registered", {
        p_email: normalized,
      });

      if (rpcError) {
        const msg = rpcError.message ?? "";
        const code = (rpcError as { code?: string }).code;
        const looksMissing =
          msg.includes("does not exist") ||
          msg.includes("Could not find the function") ||
          code === "PGRST202" ||
          code === "42883";

        if (looksMissing) {
          throw new Error(
            "Duplicate email check is not configured. Run lil-edit/supabase/sql/create_profiles.sql first."
          );
        } else {
          throw new Error("Could not verify email availability. Please try again.");
        }
      } else if (alreadyRegistered === true) {
        throw new Error("This email is already registered. Please log in instead.");
      }
    } catch (e) {
      if (e instanceof Error) {
        // Re-throw meaningful duplicate or availability errors
        throw e;
      }
      throw new Error("Could not verify email availability. Please try again.");
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({ email: normalized });
    if (otpError) {
      throw new Error(otpError.message || "Could not send OTP. Please try again.");
    }
  };

  const ensureProfileExistsForLogin = async (email: string) => {
    const normalized = email.trim();
    if (!normalized) {
      throw new Error("Email is required");
    }

    const apiBase = getApiBaseUrl();
    if (apiBase) {
      try {
        const res = await fetch(`${apiBase}/api/auth/login/check-profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalized }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; exists?: boolean };
        if (!res.ok) {
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : `Could not verify registration status (${res.status})`
          );
        }
        if (body.exists !== true) {
          throw new Error("User not registered. Please sign up first.");
        }
        return;
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error(
            "Cannot reach the API. Start the backend in a separate terminal: npm run dev:api from the repo root (or npm run dev in backend/)."
          );
        }
        throw e;
      }
    }

    const { data, error } = await supabase.rpc("is_profile_registered", {
      p_email: normalized,
    });

    if (error) {
      if (isMissingRpcError(error.message, (error as { code?: string }).code)) {
        throw new Error(
          "Pre-login profile check is not configured. Run the updated profiles SQL setup first."
        );
      }
      throw new Error("Could not verify registration status. Please try again.");
    }

    if (data !== true) {
      throw new Error("User not registered. Please sign up first.");
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
    await ensureProfileExistsForLogin(normalized);

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
    await ensureProfileExistsForLogin(email);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) throw authError;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
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