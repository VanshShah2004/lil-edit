import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Wrench, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMaintenance } from "@/contexts/MaintenanceContext";
import MaintenancePage from "@/pages/Maintenance";

/**
 * Decides, on every render, whether to show the real app or the coming-soon page.
 *
 *   • Maintenance OFF                     → real app, always.
 *   • Maintenance ON, viewer is admin     → real app + a persistent banner, so
 *                                           admins keep full access and a shortcut
 *                                           to flip the site back on.
 *   • Maintenance ON, /admin or auth route → real app (AdminRoute still bars
 *                                           non-admins; login must stay reachable).
 *   • Maintenance ON, anyone else          → the coming-soon page.
 *
 * This is the visual half of the kill switch; backend/middleware/maintenanceGate.ts
 * is the airtight half that refuses the API regardless of what renders here.
 */

// Routes that must render normally even while the site is off: login/OTP (so an
// admin can sign in) and the admin area (so they can reach the controls).
const EXEMPT_PREFIXES = ["/login", "/auth", "/forgot-password", "/signup", "/admin"];

function isExemptRoute(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

function AdminMaintenanceBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden">
      <div className="flex items-center gap-2.5 rounded-full border border-[#9A82C9] bg-white/95 py-2 pl-4 pr-2 shadow-[0_10px_30px_rgba(106,91,149,0.25)] backdrop-blur">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B19CD9]/20">
          <Wrench className="h-3.5 w-3.5 text-[#6B5B95]" />
        </span>
        <p className="text-xs font-medium text-[#2A2440]">
          <span className="font-bold text-[#6B5B95]">Maintenance is on.</span>{" "}
          <span className="hidden sm:inline text-[#6B6480]">Customers see the coming-soon page.</span>
        </p>
        <Link
          to="/admin/settings-panel/general-settings"
          className="rounded-full bg-gradient-to-r from-[#B19CD9] to-[#9A82C9] px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Manage
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

const DISMISS_KEY = "le-maint-banner-dismissed";

function readDismissedKey(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const { active, message, updatedAt } = useMaintenance();
  const { profile, profileLoaded } = useAuth();
  const { pathname } = useLocation();

  // Admins can dismiss the banner so it doesn't nag while they work. We remember
  // WHICH maintenance episode was dismissed (keyed by updatedAt), persisted in
  // sessionStorage so it stays closed across reloads within the tab. Switching the
  // site off again later changes updatedAt, so the banner naturally returns — no
  // effect or reset needed.
  const [dismissedKey, setDismissedKey] = useState<string | null>(readDismissedKey);

  const dismissBanner = () => {
    const key = updatedAt ?? "";
    setDismissedKey(key);
    try { sessionStorage.setItem(DISMISS_KEY, key); } catch { /* ignore */ }
  };

  if (!active) return <>{children}</>;

  const isAdmin = profileLoaded && profile?.role === "admin";

  // Admins always get the real app, plus a dismissible banner on every route.
  if (isAdmin) {
    const bannerDismissed = dismissedKey !== null && dismissedKey === (updatedAt ?? "");
    return (
      <>
        {children}
        {!bannerDismissed && <AdminMaintenanceBanner onDismiss={dismissBanner} />}
      </>
    );
  }

  // Non-admins: login/admin routes still render (so admins can sign in and a
  // misrouted non-admin gets bounced by AdminRoute); everything else is curtained.
  if (isExemptRoute(pathname)) return <>{children}</>;

  return <MaintenancePage message={message} />;
}
