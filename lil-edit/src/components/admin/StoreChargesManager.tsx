import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Gift,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Truck,
  Wallet,
} from "lucide-react";

import { invalidateStoreCharges } from "@/hooks/useStoreCharges";
import {
  fetchStoreChargesAdmin,
  saveStoreCharges,
  type StoreCharges,
  type StoreChargesAdminState,
} from "@/lib/storeChargesApi";

const ACCENT = "#B19CD9";

// Mirrors the ceilings the backend enforces (routes/storeCharges.ts). Kept here so a
// slipped decimal is caught before it costs a round trip, not as the real guard.
const MAX_FEE = 100_000;
const MAX_THRESHOLD = 10_000_000;

type FieldKey = keyof StoreCharges;

interface FieldSpec {
  key: FieldKey;
  label: string;
  max: number;
  prefix: string;
  suffix?: string;
}

const FIELDS: FieldSpec[] = [
  { key: "deliveryFee", label: "Delivery charge", max: MAX_FEE, prefix: "₹" },
  { key: "freeDeliveryThreshold", label: "Free delivery above", max: MAX_THRESHOLD, prefix: "₹" },
  { key: "giftWrapFee", label: "Gift wrapping", max: MAX_FEE, prefix: "₹", suffix: "per item" },
];

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Amounts are held as strings so a half-typed or momentarily empty field stays editable. */
type Draft = Record<FieldKey, string>;

function toDraft(c: StoreCharges): Draft {
  return {
    deliveryFee: String(c.deliveryFee),
    freeDeliveryThreshold: String(c.freeDeliveryThreshold),
    giftWrapFee: String(c.giftWrapFee),
  };
}

/** null = not a usable amount. Rounded to paise, matching the backend's parse. */
function parseField(raw: string, max: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}

const StoreChargesManager = () => {
  const [state, setState] = useState<StoreChargesAdminState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchStoreChargesAdmin();
      setState(data);
      setDraft(toDraft(data));
      console.log(
        `[StoreChargesManager] loaded — delivery ₹${data.deliveryFee}, free above ₹${data.freeDeliveryThreshold}, gift ₹${data.giftWrapFee}/item`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load store charges.";
      setLoadError(msg);
      console.error("[StoreChargesManager] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Per-field validity, and the parsed values a save would send.
  const parsed = useMemo(() => {
    if (!draft) return null;
    return {
      deliveryFee: parseField(draft.deliveryFee, MAX_FEE),
      freeDeliveryThreshold: parseField(draft.freeDeliveryThreshold, MAX_THRESHOLD),
      giftWrapFee: parseField(draft.giftWrapFee, MAX_FEE),
    } as Record<FieldKey, number | null>;
  }, [draft]);

  const allValid = !!parsed && FIELDS.every((f) => parsed[f.key] !== null);
  const dirty =
    !!state && !!parsed && FIELDS.some((f) => parsed[f.key] !== null && parsed[f.key] !== state[f.key]);

  // The rule has edge cases (zero fee, zero threshold) where the numbers alone
  // mislead, so state the effect. This replaces the per-field hints entirely.
  const preview = useMemo(() => {
    if (!parsed || !allValid) return null;
    const fee = parsed.deliveryFee as number;
    const threshold = parsed.freeDeliveryThreshold as number;
    const gift = parsed.giftWrapFee as number;

    const delivery =
      fee === 0 || threshold === 0
        ? "Free delivery on all orders."
        : `${inr(fee)} up to ${inr(threshold)}, free above.`;
    const wrapping = gift === 0 ? "Gift wrapping free." : `Gift wrapping ${inr(gift)} per item.`;
    return { delivery, wrapping };
  }, [parsed, allValid]);

  const handleSave = async () => {
    if (!parsed || !allValid || !dirty || saving) return;
    setSaving(true);
    try {
      const next = await saveStoreCharges({
        deliveryFee: parsed.deliveryFee as number,
        freeDeliveryThreshold: parsed.freeDeliveryThreshold as number,
        giftWrapFee: parsed.giftWrapFee as number,
      });
      setState(next);
      setDraft(toDraft(next));
      // Drop the storefront's per-session cache so Cart/Checkout pick the new
      // numbers up on their next mount instead of a stale set.
      invalidateStoreCharges();
      console.log(
        `[StoreChargesManager] saved — delivery ₹${next.deliveryFee}, free above ₹${next.freeDeliveryThreshold}, gift ₹${next.giftWrapFee}/item`,
      );
      toast.success("Charges updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the charges.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!state) return;
    setDraft(toDraft(state));
  };

  return (
    <section>
      {/* Section heading — matches the other General Settings sections. */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-900 shrink-0 flex items-center gap-2">
          <Wallet className="w-4 h-4" style={{ color: ACCENT }} />
          Delivery &amp; Gifting Charges
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
                <p className="text-sm font-semibold text-red-800">Couldn't load store charges</p>
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

        {!loading && !loadError && state && draft && parsed && (
          <>
            <div className="p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {FIELDS.map((field) => {
                  const value = draft[field.key];
                  const invalid = parseField(value, field.max) === null;
                  return (
                    <div key={field.key} className="min-w-0">
                      <label
                        htmlFor={`charge-${field.key}`}
                        className="block text-sm font-semibold text-gray-800 mb-1.5"
                      >
                        {field.label}
                      </label>
                      <div
                        className={`flex items-center rounded-md border bg-white transition-colors focus-within:ring-2 ${
                          invalid
                            ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500/20"
                            : "border-gray-400 focus-within:border-[#B19CD9] focus-within:ring-[#B19CD9]/30"
                        }`}
                      >
                        <span className="pl-3 pr-1 text-sm font-medium text-gray-500 select-none">{field.prefix}</span>
                        <input
                          id={`charge-${field.key}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={field.max}
                          step="1"
                          value={value}
                          onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                          disabled={saving}
                          className="w-full min-w-0 bg-transparent py-2.5 pr-3 text-sm text-gray-900 outline-none disabled:opacity-60"
                        />
                        {field.suffix && (
                          <span className="pr-3 text-[11px] text-gray-400 whitespace-nowrap select-none">
                            {field.suffix}
                          </span>
                        )}
                      </div>
                      {invalid && (
                        <p className="mt-1.5 text-[11px] font-medium text-red-600">
                          0 – {inr(field.max)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* The rule in words — the only prose left, and the part that earns it. */}
            {preview && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3 border-t border-gray-200 bg-gray-50/60 text-xs text-gray-700">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} />
                  {preview.delivery}
                </span>
                <span className="flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} />
                  {preview.wrapping}
                </span>
              </div>
            )}

            {/* Audit + actions */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5 border-t border-gray-200">
              <p className="text-[11px] text-gray-500 flex-1 min-w-0">
                Applies to new checkouts · changed {formatWhen(state.updatedAt)}
                {state.updatedByEmail ? <> by <span className="font-medium text-gray-700">{state.updatedByEmail}</span></> : null}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-400 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Discard
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!dirty || !allValid || saving}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? "Saving…" : "Save charges"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default StoreChargesManager;
