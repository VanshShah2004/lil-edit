import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { X, LogIn, UserPlus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A small "Log in or create an account" gate for guest actions that need an account
 * (checkout, moving a wishlist item into the real cart). A guest trigger saves its intent,
 * then calls promptAuth(redirect) to open this modal instead of bouncing straight to /login —
 * giving the shopper a clear choice. Both buttons carry the return path so the flow resumes
 * after auth (see Login/Signup ?redirect= handling and GuestIntentBridge).
 */
interface AuthPromptContextType {
  /** Open the login/signup choice. `redirect` is where to land after auth (e.g. "/checkout"). */
  promptAuth: (redirect: string) => void;
}

const AuthPromptContext = createContext<AuthPromptContextType | undefined>(undefined);

export function AuthPromptProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // null = closed; a string = open with that post-auth redirect target.
  const [redirect, setRedirect] = useState<string | null>(null);

  const promptAuth = useCallback((r: string) => setRedirect(r), []);
  const close = useCallback(() => setRedirect(null), []);

  const go = (path: "login" | "signup") => {
    const target =
      redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
    setRedirect(null);
    navigate(`/${path}?redirect=${encodeURIComponent(target)}`);
  };

  const subtitle = redirect?.startsWith("/checkout")
    ? "Log in or create an account to complete your checkout."
    : "Log in or create an account to continue.";

  return (
    <AuthPromptContext.Provider value={{ promptAuth }}>
      {children}

      {redirect !== null && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Continue to your account"
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />

          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 sm:p-7 animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute top-3.5 right-3.5 p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-brand-teal/10 flex items-center justify-center mb-4">
                <ShoppingBag className="w-7 h-7 text-brand-teal" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Almost there!</h2>
              <p className="text-sm text-gray-500 mt-1.5">{subtitle}</p>
            </div>

            <div className="flex flex-col gap-2.5 mt-6">
              <Button
                onClick={() => go("login")}
                className="w-full bg-brand-teal hover:bg-[#0C5D53] text-white rounded-lg h-11 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" /> Log In
              </Button>
              <Button
                variant="outline"
                onClick={() => go("signup")}
                className="w-full border-brand-teal/40 text-brand-teal hover:bg-brand-teal/5 rounded-lg h-11 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Sign Up
              </Button>
            </div>

            <p className="text-center text-xs text-gray-400 mt-4">
              Your selected items are saved and waiting for you.
            </p>
          </div>
        </div>
      )}
    </AuthPromptContext.Provider>
  );
}

export function useAuthPrompt(): AuthPromptContextType {
  const ctx = useContext(AuthPromptContext);
  if (!ctx) throw new Error("useAuthPrompt must be used inside <AuthPromptProvider>");
  return ctx;
}
