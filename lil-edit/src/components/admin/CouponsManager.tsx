import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Loader2,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  ToggleLeft,
  ToggleRight,
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
import StockToggleSlider from "@/components/StockToggleSlider";
import {
  fetchCoupons,
  createCoupon,
  toggleCoupon,
  deleteCoupon,
  type Coupon,
  type CreateCouponPayload,
} from "@/lib/couponsApi";

const ACCENT = "#B19CD9";

const EMPTY_FORM: CreateCouponPayload = {
  code: "",
  discount_type: "percentage",
  discount_value: 0,
  min_order_amount: null,
  max_uses: null,
  expires_at: null,
  first_order_only: false,
  once_per_user: false,
  max_discount_amount: null,
};

function formatDiscount(coupon: Coupon): string {
  if (coupon.discount_type === "percentage") {
    const cap = coupon.max_discount_amount != null ? ` (up to ₹${coupon.max_discount_amount})` : "";
    return `${coupon.discount_value}% off${cap}`;
  }
  return `₹${coupon.discount_value} off`;
}

function formatExpiry(expires_at: string | null): string {
  if (!expires_at) return "Never";
  return new Date(expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function isExpired(expires_at: string | null): boolean {
  if (!expires_at) return false;
  return new Date(expires_at) < new Date();
}

const CouponsManager = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateCouponPayload>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchCoupons();
      setCoupons(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load coupons.";
      setLoadError(msg);
      console.error("[CouponsManager] load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!code) return;
    if (!form.discount_value || form.discount_value <= 0) {
      toast.error("Discount value must be greater than 0.");
      return;
    }
    setCreating(true);
    try {
      await createCoupon({
        ...form,
        code,
        min_order_amount: form.min_order_amount || null,
        max_uses: form.max_uses || null,
        expires_at: form.expires_at || null,
      });
      toast.success(`Coupon "${code}" created.`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create coupon.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    try {
      const updated = await toggleCoupon(coupon.id, !coupon.is_active);
      setCoupons((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(`"${coupon.code}" ${updated.is_active ? "activated" : "deactivated"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update coupon.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCoupon(deleteTarget.id);
      toast.success(`Coupon "${deleteTarget.code}" deleted.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete coupon.");
    } finally {
      setDeleting(false);
    }
  };

  const inputClass = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/30 disabled:opacity-60";
  const labelClass = "block text-xs font-semibold text-gray-700 mb-1";

  return (
    <section>
      {/* Section heading */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gray-700 shrink-0 flex items-center gap-2">
          <Tag className="w-4 h-4" style={{ color: ACCENT }} />
          Coupons
        </h2>
        <div className="flex-1 h-px bg-gray-400" />
      </div>

      <div className="rounded-lg border border-gray-300 bg-white overflow-hidden shadow-sm">

        {/* Toolbar — count + create toggle */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
            All coupons{!loading && !loadError ? ` (${coupons.length})` : ""}
          </p>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all shrink-0"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? "Cancel" : "New coupon"}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="p-5 border-b border-gray-200">
            <form onSubmit={handleCreate} className="space-y-4">
              <p className="text-sm font-semibold text-gray-800">Create coupon</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Code</label>
                  <input
                    type="text"
                    required
                    placeholder="SUMMER20"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    disabled={creating}
                    className={inputClass}
                    maxLength={32}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Uppercase letters, numbers, - or _</p>
                </div>

                <div>
                  <label className={labelClass}>Discount type</label>
                  <select
                    value={form.discount_type}
                    onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as "percentage" | "fixed" }))}
                    disabled={creating}
                    className={inputClass}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>
                    Discount value {form.discount_type === "percentage" ? "(%)" : "(₹)"}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={form.discount_type === "percentage" ? 100 : undefined}
                    step="0.01"
                    placeholder={form.discount_type === "percentage" ? "20" : "100"}
                    value={form.discount_value || ""}
                    onChange={(e) => setForm((f) => ({ ...f, discount_value: Number(e.target.value) }))}
                    disabled={creating}
                    className={inputClass}
                  />
                </div>

                {/* Max discount cap — only meaningful for percentage coupons */}
                {form.discount_type === "percentage" && (
                  <div>
                    <label className={labelClass}>Max discount (₹)</label>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      placeholder="No cap"
                      value={form.max_discount_amount ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, max_discount_amount: e.target.value ? Number(e.target.value) : null }))}
                      disabled={creating}
                      className={inputClass}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Caps the deduction, e.g. 20% up to ₹500.</p>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Min order amount (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Optional"
                    value={form.min_order_amount ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value ? Number(e.target.value) : null }))}
                    disabled={creating}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Max uses</label>
                  <StockToggleSlider
                    isUnlimited={form.max_uses === null}
                    onChange={(unlimited) =>
                      setForm((f) => ({ ...f, max_uses: unlimited ? null : 1 }))
                    }
                    className="h-9"
                    limitedLabel="Limited"
                    unlimitedLabel="Unlimited"
                  />
                  {form.max_uses !== null && (
                    <div className="flex items-center mt-2 rounded-md border border-gray-300 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, max_uses: Math.max(1, (f.max_uses ?? 1) - 1) }))}
                        disabled={creating || (form.max_uses ?? 1) <= 1}
                        className="px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 border-r border-gray-300"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={form.max_uses}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, max_uses: e.target.value ? Math.max(1, Number(e.target.value)) : 1 }))
                        }
                        disabled={creating}
                        className="flex-1 text-center text-sm text-gray-900 py-2 outline-none focus:ring-2 focus:ring-[#B19CD9]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, max_uses: (f.max_uses ?? 1) + 1 }))}
                        disabled={creating}
                        className="px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors border-l border-gray-300"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Expiry date</label>
                  <input
                    type="date"
                    value={form.expires_at ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value || null }))}
                    disabled={creating}
                    className={inputClass}
                  />
                </div>

                {/* Usage rules */}
                <div className="sm:col-span-2 space-y-2.5 pt-1">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.first_order_only ?? false}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        first_order_only: e.target.checked,
                        // A first-order coupon is inherently once-per-customer.
                        once_per_user: e.target.checked ? true : f.once_per_user,
                      }))}
                      disabled={creating}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#9A82C9] focus:ring-[#B19CD9]/40"
                    />
                    <span className="text-sm text-gray-700">
                      First purchase only
                      <span className="block text-[11px] text-gray-400">Valid only on a customer's first-ever order.</span>
                    </span>
                  </label>
                  <label className={`flex items-start gap-2.5 ${form.first_order_only ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={(form.once_per_user ?? false) || (form.first_order_only ?? false)}
                      onChange={(e) => setForm((f) => ({ ...f, once_per_user: e.target.checked }))}
                      disabled={creating || (form.first_order_only ?? false)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#9A82C9] focus:ring-[#B19CD9]/40"
                    />
                    <span className="text-sm text-gray-700">
                      One use per customer
                      <span className="block text-[11px] text-gray-400">Each customer can redeem this code only once.</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                  disabled={creating}
                  className="rounded-md border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${ACCENT}, #9A82C9)` }}
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {creating ? "Creating…" : "Create coupon"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Load error */}
        {loadError && (
          <div className="p-5 bg-red-50">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-800">Couldn't load coupons</p>
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

        {/* Loading */}
        {loading && !loadError && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !loadError && coupons.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Tag className="w-8 h-8 text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-500">No coupons yet</p>
            <p className="text-xs text-gray-400 mt-1">Click "New coupon" to create your first discount code.</p>
          </div>
        )}

        {/* Coupon list */}
        {!loading && !loadError && coupons.length > 0 && (
          <ul className="divide-y divide-gray-300">
              {coupons.map((coupon) => {
                const expired = isExpired(coupon.expires_at);
                const exhausted = coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses;
                const effectivelyInactive = !coupon.is_active || expired || exhausted;

                return (
                  <li key={coupon.id} className="flex items-center gap-4 px-5 py-4">
                    {/* Code + badge */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-gray-900 tracking-widest">
                          {coupon.code}
                        </span>
                        {expired && (
                          <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-[10px] font-bold uppercase tracking-wide text-red-600">
                            Expired
                          </span>
                        )}
                        {exhausted && !expired && (
                          <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-[10px] font-bold uppercase tracking-wide text-orange-600">
                            Exhausted
                          </span>
                        )}
                        {!effectivelyInactive && (
                          <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-[10px] font-bold uppercase tracking-wide text-green-700">
                            Active
                          </span>
                        )}
                        {!coupon.is_active && !expired && !exhausted && (
                          <span className="px-1.5 py-0.5 rounded-full bg-gray-200 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                            Inactive
                          </span>
                        )}
                        {coupon.first_order_only && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#B19CD9]/15 text-[10px] font-bold uppercase tracking-wide text-[#6B5B95]">
                            First order
                          </span>
                        )}
                        {coupon.once_per_user && !coupon.first_order_only && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#B19CD9]/15 text-[10px] font-bold uppercase tracking-wide text-[#6B5B95]">
                            1 / customer
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        <p className="text-xs text-gray-600">{formatDiscount(coupon)}</p>
                        {coupon.min_order_amount != null && (
                          <p className="text-xs text-gray-400">Min ₹{coupon.min_order_amount}</p>
                        )}
                        <p className="text-xs text-gray-400">
                          {coupon.uses_count} / {coupon.max_uses ?? "∞"} uses
                        </p>
                        <p className="text-xs text-gray-400">Expires: {formatExpiry(coupon.expires_at)}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleToggle(coupon)}
                        title={coupon.is_active ? "Deactivate" : "Activate"}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        {coupon.is_active
                          ? <ToggleRight className="w-4 h-4 text-green-600" />
                          : <ToggleLeft className="w-4 h-4 text-gray-400" />
                        }
                        {coupon.is_active ? "On" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(coupon)}
                        title="Delete coupon"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete coupon?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <span className="font-semibold font-mono">{deleteTarget?.code}</span>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Deleting…
                </span>
              ) : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default CouponsManager;
