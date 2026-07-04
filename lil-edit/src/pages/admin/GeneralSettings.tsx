import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronRight,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import CouponsManager from "@/components/admin/CouponsManager";
import ReviewsManager from "@/components/admin/ReviewsManager";
import MaintenanceControl from "@/components/admin/MaintenanceControl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchAccessList,
  grantAdmin,
  revokeAdmin,
  type AccessList,
  type AdminEntry,
} from "@/lib/adminAccessApi";

const ACCENT = "#B19CD9";

// Mirror of the backend / DB email validation — keep all three in sync.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function displayName(entry: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [entry.firstName, entry.lastName].filter(Boolean).join(" ").trim();
  return name || entry.email.split("@")[0];
}

function initials(entry: { firstName: string | null; lastName: string | null; email: string }): string {
  const first = (entry.firstName ?? "").trim();
  const last = (entry.lastName ?? "").trim();
  if (first || last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.charAt(0).toUpperCase();
  return entry.email.charAt(0).toUpperCase();
}

interface RemoveTarget {
  email: string;
  isPending: boolean;
}

const GeneralSettings = () => {
  const [list, setList] = useState<AccessList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [granting, setGranting] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    document.title = "General Settings | Lil Edit";
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchAccessList();
      setList(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load admin access.";
      setLoadError(msg);
      console.error("[GeneralSettings] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);

  const handleGrant = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailValid || granting) return;
    setGranting(true);
    try {
      const result = await grantAdmin(trimmedEmail);
      if (result.status === "granted") {
        toast.success(
          result.profileExists
            ? `Admin access granted to ${result.email}.`
            : `${result.email} will be an admin as soon as they sign up.`,
        );
      } else if (result.status === "already_admin") {
        toast.info(`${result.email} is already an admin.`);
      } else {
        toast.success(result.message);
      }
      setEmail("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not grant admin access.");
    } finally {
      setGranting(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const result = await revokeAdmin(removeTarget.email);
      if (result.status === "revoked") {
        toast.success(`Admin access removed from ${result.email}.`);
      } else if (result.status === "already_not_admin") {
        toast.info(`${result.email} was not an admin.`);
      } else {
        toast.success(result.message);
      }
      setRemoveTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove admin access.");
    } finally {
      setRemoving(false);
    }
  };

  const admins = list?.admins ?? [];
  const pending = list?.pending ?? [];

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      <UserNavbar />

      <div className="relative pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)] bg-white pb-0">
        <div className="max-w-screen-2xl mx-auto px-3 lg:px-6">
          <div className="pt-3 pb-2 mt-1.5 mb-1">
            <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
              <Link to="/" className="hover:underline">
                Home
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-800 font-medium">General Settings</span>
            </div>
          </div>
          <div className="space-y-1 mb-8">
            <div className="flex items-center">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                Admin
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">General Settings</h1>
            <p className="text-sm text-gray-500">Manage who has administrator access to the platform.</p>
          </div>
          <hr className="-mx-3 lg:-mx-6 border-t border-foreground/50" />
        </div>
      </div>

      <main className="flex-1 px-3 lg:px-6 pt-4 pb-24 bg-gray-100">
        <div className="max-w-4xl sm:max-w-3xl mx-auto pt-4 space-y-12">
          <section>
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-900 shrink-0 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" style={{ color: ACCENT }} />
                Administrator Access
              </h2>
              <div className="flex-1 h-px bg-gray-900" />
            </div>

            {/* Single unified card */}
            <div className="rounded-lg border border-gray-900 bg-white overflow-hidden shadow-sm">

              {/* Grant form */}
              <div className="p-5">
                <form onSubmit={handleGrant} className="space-y-3">
                  <label htmlFor="grant-email" className="block text-sm font-semibold text-gray-800">
                    Grant admin access
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      id="grant-email"
                      type="email"
                      autoComplete="off"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={granting}
                      className="flex-1 rounded-md border border-gray-400 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={!emailValid || granting}
                      className="inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                    >
                      {granting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      {granting ? "Granting…" : "Grant admin"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Enter any email address. If the person doesn't have an account yet, they'll be made an admin
                    automatically the moment they sign up. Granting to an existing account takes effect immediately.
                  </p>
                </form>
              </div>

              {/* Load error */}
              {loadError && (
                <div className="p-5 bg-red-50">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-red-800">Couldn't load admin access</p>
                      <p className="text-xs text-red-700 mt-1 break-words">{loadError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setLoading(true);
                          void load();
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Try again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading */}
              {loading && !loadError && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              )}

              {/* Current administrators */}
              {!loading && !loadError && (
                <>
                  <div className="px-5 py-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Administrators ({admins.length})
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-400">
                    {admins.map((entry: AdminEntry) => {
                      const canRevoke = !entry.isSelf;
                      const reason = entry.isSelf ? "You can't revoke your own access" : "";
                      return (
                        <li key={entry.email} className="flex items-center gap-4 px-5 py-3.5">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                            style={{
                              background: entry.accountExists
                                ? `linear-gradient(135deg, ${ACCENT}, #9A82C9)`
                                : "linear-gradient(135deg,#cbd5e1,#94a3b8)",
                            }}
                          >
                            {initials(entry)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 break-all">{displayName(entry)}</p>
                              {entry.isSelf && (
                                <span className="px-1.5 py-0.5 rounded-md bg-[#B19CD9]/15 text-[10px] font-bold uppercase tracking-wide text-[#6B5B95]">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 break-all">{entry.email}</p>
                            {!entry.accountExists && (
                              <p className="text-[11px] text-gray-400 mt-0.5">No account yet</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setRemoveTarget({ email: entry.email, isPending: false })}
                            disabled={!canRevoke}
                            title={canRevoke ? "Revoke admin access" : reason}
                            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-40 border-gray-400 text-gray-600 enabled:hover:border-red-300 enabled:hover:bg-red-50 enabled:hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Revoke
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {/* Pending invitations */}
              {!loading && !loadError && pending.length > 0 && (
                <>
                  <div className="px-5 py-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Pending invitations ({pending.length})
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-400">
                    {pending.map((entry) => (
                      <li key={entry.email} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                          <Mail className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900 break-all">{entry.email}</p>
                            <span className="px-1.5 py-0.5 rounded-md bg-gray-200 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                              Invited
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">No account yet</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRemoveTarget({ email: entry.email, isPending: true })}
                          title="Cancel invitation"
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

            </div>
          </section>

          <CouponsManager />

          <ReviewsManager />

          <MaintenanceControl />
        </div>
      </main>

      <div className="border-t border-gray-400" />
      <Footer />

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeTarget?.isPending ? "Cancel invitation?" : "Revoke admin access?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.isPending ? (
                <>
                  Cancel the pending admin invitation for <span className="font-semibold">{removeTarget?.email}</span>?
                  If they sign up later, they'll be a regular customer.
                </>
              ) : (
                <>
                  Revoke admin access from <span className="font-semibold">{removeTarget?.email}</span>? They'll become
                  a regular customer and lose access to the admin area on their next request.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
              disabled={removing}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {removing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Revoking…
                </span>
              ) : removeTarget?.isPending ? (
                "Cancel invitation"
              ) : (
                "Revoke access"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GeneralSettings;
