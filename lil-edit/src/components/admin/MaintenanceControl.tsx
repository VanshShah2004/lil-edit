import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Eye,
  Loader2,
  Power,
  RefreshCw,
  Save,
  X,
} from "lucide-react";

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
import { useMaintenance } from "@/contexts/MaintenanceContext";
import MaintenancePage from "@/pages/Maintenance";
import {
  fetchMaintenanceAdmin,
  setMaintenanceMode,
  type MaintenanceAdminState,
} from "@/lib/maintenanceApi";

const ACCENT = "#B19CD9";

// The word an admin must type to confirm taking the whole storefront offline.
const OFFLINE_PHRASE = "OFFLINE";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const MaintenanceControl = () => {
  const { refresh: refreshGlobal } = useMaintenance();

  const [state, setState] = useState<MaintenanceAdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [savingMessage, setSavingMessage] = useState(false);

  // Which confirmation is open, and the typed phrase for the offline guard.
  const [confirm, setConfirm] = useState<null | "offline" | "live">(null);
  const [confirmText, setConfirmText] = useState("");
  const [toggling, setToggling] = useState(false);

  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchMaintenanceAdmin();
      setState(data);
      setMessage(data.message ?? "");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load site availability.";
      setLoadError(msg);
      console.error("[MaintenanceControl] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = state?.active ?? false;
  const messageDirty = (state?.message ?? "") !== message.trim() && !(state?.message == null && message.trim() === "");

  // Persist just the coming-soon copy — availability stays exactly as it is, so
  // this never needs a confirmation.
  const handleSaveMessage = async () => {
    if (!state) return;
    setSavingMessage(true);
    try {
      const next = await setMaintenanceMode(active, message.trim());
      setState(next);
      setMessage(next.message ?? "");
      await refreshGlobal();
      toast.success("Coming-soon message saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the message.");
    } finally {
      setSavingMessage(false);
    }
  };

  const openToggle = () => {
    setConfirmText("");
    setConfirm(active ? "live" : "offline");
  };

  const confirmToggle = async () => {
    const goingOffline = confirm === "offline";
    setToggling(true);
    try {
      // Going offline applies the typed message too; going live leaves copy as-is.
      const next = goingOffline
        ? await setMaintenanceMode(true, message.trim())
        : await setMaintenanceMode(false);
      setState(next);
      setMessage(next.message ?? "");
      await refreshGlobal();
      setConfirm(null);
      toast.success(goingOffline ? "Site is now offline — customers see the coming-soon page." : "Site is back live.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change site availability.");
    } finally {
      setToggling(false);
    }
  };

  const offlineConfirmReady = confirmText.trim().toUpperCase() === OFFLINE_PHRASE;

  return (
    <section>
      {/* Section heading — matches the other General Settings sections. */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-900 shrink-0 flex items-center gap-2">
          <Power className="w-4 h-4" style={{ color: ACCENT }} />
          Site Availability
        </h2>
        <div className="flex-1 h-px bg-gray-900" />
      </div>

      <div className="rounded-lg border border-gray-900 bg-white overflow-hidden shadow-sm">
        {/* Load error */}
        {loadError && (
          <div className="p-5 bg-red-50">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-800">Couldn't load site availability</p>
                <p className="text-xs text-red-700 mt-1 break-words">{loadError}</p>
                <button
                  type="button"
                  onClick={() => { setLoading(true); void load(); }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && !loadError && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && !loadError && state && (
          <>
            {/* Status row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 border-b border-gray-200">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span
                  className={`relative flex h-3 w-3 shrink-0 ${active ? "" : ""}`}
                  aria-hidden="true"
                >
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${active ? "bg-amber-400 animate-ping" : "bg-emerald-400"}`} />
                  <span className={`relative inline-flex h-3 w-3 rounded-full ${active ? "bg-amber-500" : "bg-emerald-500"}`} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">
                    {active ? "Under maintenance" : "Live"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {active
                      ? "Customers see the coming-soon page. Storefront and checkout are closed."
                      : "The storefront is open and fully functional."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={openToggle}
                className={`inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all shrink-0 ${
                  active
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                <Power className="w-4 h-4" />
                {active ? "Bring site back live" : "Take site offline"}
              </button>
            </div>

            {/* Audit line */}
            <div className="px-5 py-2.5 border-b border-gray-200 bg-gray-50/60">
              <p className="text-[11px] text-gray-500">
                Last changed {formatWhen(state.updatedAt)}
                {state.updatedByEmail ? <> by <span className="font-medium text-gray-700">{state.updatedByEmail}</span></> : null}
              </p>
            </div>

            {/* Message editor */}
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="maintenance-message" className="block text-sm font-semibold text-gray-800">
                  Coming-soon message
                </label>
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-400 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
              </div>
              <textarea
                id="maintenance-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={400}
                placeholder="Optional — a line under the headline. Leave blank to show none."
                className="w-full rounded-md border border-gray-400 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 resize-none"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Shown under the coming-soon headline. Blank shows no message at all.
                </p>
                <button
                  type="button"
                  onClick={() => void handleSaveMessage()}
                  disabled={savingMessage || !messageDirty}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                  style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                >
                  {savingMessage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {savingMessage ? "Saving…" : "Save message"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirmation dialog */}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => { if (!open && !toggling) setConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "offline" ? "Take the whole site offline?" : "Bring the site back live?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "offline" ? (
                <>
                  Every customer will immediately see the coming-soon page, and the storefront, cart and
                  checkout will be closed. You&rsquo;ll keep full access as an admin.
                  <br /><br />
                  Type <span className="font-mono font-bold text-gray-900">{OFFLINE_PHRASE}</span> to confirm.
                </>
              ) : (
                <>The storefront will reopen for everyone right away. Customers will be able to browse and check out again.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirm === "offline" && (
            <input
              type="text"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={OFFLINE_PHRASE}
              disabled={toggling}
              className="w-full rounded-md border border-gray-400 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 font-mono tracking-widest uppercase"
            />
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmToggle(); }}
              disabled={toggling || (confirm === "offline" && !offlineConfirmReady)}
              className={confirm === "offline"
                ? "bg-amber-500 hover:bg-amber-600 focus:ring-amber-500"
                : "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600"}
            >
              {toggling ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Applying…
                </span>
              ) : confirm === "offline" ? (
                "Take site offline"
              ) : (
                "Go live"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full-screen preview of the coming-soon page with the current draft copy. */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] overflow-auto bg-white">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="fixed top-4 right-4 z-[101] inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-md backdrop-blur hover:bg-white transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Close preview
          </button>
          <MaintenancePage message={message.trim() || null} />
        </div>
      )}
    </section>
  );
};

export default MaintenanceControl;
