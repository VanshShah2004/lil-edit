import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Lock, MapPin, Tag, Loader2, Check, ShieldCheck, Plus, Package, Sparkles, Award, Banknote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/lib/supabase";
import type { Address } from "@/components/profile/AddressManager";
import { computeCartTotals } from "@/lib/pricing";
import {
  initiateCheckout,
  verifyCheckout,
  validateCoupon,
  loadRazorpayScript,
  fetchActiveCoupons,
  formatCouponSavings,
  formatCouponOffer,
  computeCouponSavings,
  type ActiveCoupon,
  type CheckoutItemInput,
  type InitiatePayload,
  type RazorpaySuccess,
} from "@/lib/checkoutApi";

// Direct ("Buy Now") item rides in on router nav state. The first four fields are the
// canonical ones the backend re-prices from; the rest are display-only so the summary
// renders without a round-trip.
interface DirectNavItem extends CheckoutItemInput {
  title?: string;
  price?: number;
  originalPrice?: number;
  image?: string;
  colorName?: string;
}
interface CheckoutNavState {
  mode?: "cart" | "direct";
  item?: DirectNavItem;
  coupon?: { code: string; discount: number; reason?: string };
  /** Cart mode only — the cart_items ids the user checked on the Cart page. */
  itemIds?: string[];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const titleCase = (value: string) =>
  value.replace(/\b\w/g, (char) => char.toUpperCase());

// Inline "add address" form on checkout — mirrors the Profile AddressManager fields, but
// saves straight to the addresses table so the new row gets a real id we can select for
// this order. Country defaults to India (the pincode lookup fills city/state/country).
type AddrForm = {
  type: string; label: string; line1: string; line2: string; landmark: string;
  city: string; state: string; country: string; pincode: string; is_default: boolean;
};
const EMPTY_ADDR_FORM: AddrForm = {
  type: "home", label: "", line1: "", line2: "", landmark: "",
  city: "", state: "", country: "India", pincode: "", is_default: false,
};
const ADDR_INPUT_CLS =
  "w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/40";

export default function Checkout() {
  const { user, profile, loading: authLoading } = useAuth();
  const { cartItems, loading: cartLoading, refetchCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const navState = (location.state ?? null) as CheckoutNavState | null;
  // Direct mode only when a valid item rode in. A hard refresh of /checkout loses nav
  // state, so we safely fall back to cart mode.
  const directItem =
    navState?.mode === "direct" && navState.item?.product_slug && navState.item?.sku
      ? navState.item
      : null;
  const mode: "cart" | "direct" = directItem ? "direct" : "cart";
  const carriedCoupon =
    mode === "cart" && navState?.coupon?.code
      ? navState.coupon
      : null;
  // A hard refresh loses nav state — falls back to the whole cart, same as directItem above.
  const selectedItemIds = mode === "cart" && navState?.itemIds?.length ? navState.itemIds : null;
  const cartItemsForCheckout = selectedItemIds
    ? cartItems.filter((it) => selectedItemIds.includes(it.id))
    : cartItems;

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [addingAddress, setAddingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addrForm, setAddrForm] = useState<AddrForm>(EMPTY_ADDR_FORM);
  const [dragPillPct, setDragPillPct] = useState<number | null>(null);
  const addrSliderRef = useRef<HTMLDivElement>(null);
  const addrFormRef = useRef(addrForm);
  addrFormRef.current = addrForm;
  const addressesRef = useRef(addresses);
  addressesRef.current = addresses;

  const [couponInput, setCouponInput] = useState(() => carriedCoupon?.code ?? "");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(() =>
    carriedCoupon ? { code: carriedCoupon.code, discount: carriedCoupon.discount } : null,
  );
  const [couponMsg, setCouponMsg] = useState(() => carriedCoupon?.reason ?? "");
  const [couponChecking, setCouponChecking] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const [activeCoupons, setActiveCoupons] = useState<ActiveCoupon[]>([]);
  const [showCoupons, setShowCoupons] = useState(false);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const couponContainerRef = useRef<HTMLDivElement>(null);
  const carriedCouponSyncedRef = useRef(!carriedCoupon?.code);

  useEffect(() => {
    const prev = document.title;
    document.title = "Checkout | Lil Edit";
    return () => { document.title = prev; };
  }, []);

  // Subtotal for coupon applicability checks — computed early so the coupon fetch
  // can depend on it. The full `totals` object is built further down.
  const couponSubtotal = useMemo(
    () => (mode === "direct" && directItem
      ? (directItem.price ?? 0) * directItem.quantity
      : cartItemsForCheckout.reduce((sum, it) => sum + it.price * it.quantity, 0)),
    [mode, directItem, cartItemsForCheckout],
  );

  useEffect(() => {
    if (!user) return;
    let active = true;
    setCouponsLoaded(false);
    void (async () => {
      try {
        const list = await fetchActiveCoupons(couponSubtotal);
        if (active) {
          setActiveCoupons(list);
          console.log(`[Checkout] Loaded ${list.length} coupons (${list.filter(c => c.applicable).length} applicable)`);
        }
      } catch (err) {
        console.error("[Checkout] Failed to load coupons", err);
      } finally {
        if (active) setCouponsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, couponSubtotal]);

  // Coupon carried from Cart → re-validate against checkout subtotal once the cart is ready.
  useEffect(() => {
    if (!carriedCoupon?.code || mode !== "cart" || cartLoading || carriedCouponSyncedRef.current) return;
    if (couponSubtotal <= 0) return;

    carriedCouponSyncedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await validateCoupon(carriedCoupon.code, couponSubtotal);
        if (cancelled) return;
        if (res.valid) {
          setCouponInput(carriedCoupon.code);
          setCoupon({ code: carriedCoupon.code, discount: res.discount });
          setCouponMsg(res.reason);
        } else {
          setCoupon(null);
          setCouponMsg(res.reason);
        }
      } catch (e) {
        if (!cancelled) {
          setCoupon(null);
          setCouponMsg(e instanceof Error ? e.message : "Could not apply coupon");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carriedCoupon, mode, cartLoading, couponSubtotal]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (couponContainerRef.current && !couponContainerRef.current.contains(e.target as Node)) {
        setShowCoupons(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const [paying, setPaying] = useState(false);

  const userId = user?.id ?? null;

  // ── Load the user's saved addresses (RLS-scoped select, same as Profile) ──────
  useEffect(() => {
    if (!userId) {
      setAddresses([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setAddressesLoading(true);
      try {
        const { data, error } = await supabase
          .from("addresses")
          .select("*")
          .eq("user_id", userId)
          .order("is_default", { ascending: false });
        if (cancelled) return;
        if (error) throw error;
        const list = (data ?? []) as Address[];
        setAddresses(list);
        setSelectedAddressId((prev) => prev || list.find((a) => a.is_default)?.id || list[0]?.id || "");
        console.log(`[Checkout] loaded ${list.length} address(es)`);
      } catch (e) {
        if (!cancelled) {
          console.error("[Checkout] address fetch failed", e);
          setAddresses([]);
        }
      } finally {
        if (!cancelled) setAddressesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ── Inline add-address: pincode auto-fill + immediate save ────────────────────
  const handleAddrPincode = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setAddrForm((p) => ({ ...p, pincode: value }));
    if (value.length !== 6) return;
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${value}`);
      const data = await res.json();
      if (data?.[0]?.Status === "Success") {
        const po = data[0].PostOffice[0];
        setAddrForm((p) => ({ ...p, city: po.District, state: po.State, country: "India" }));
        console.log(`[Checkout] pincode ${value} → ${po.District}, ${po.State}`);
      }
    } catch (err) {
      console.error("[Checkout] pincode lookup failed", err);
    }
  };

  // Open the inline form pre-set to the first still-available singular type (home → work →
  // other), so a duplicate Home/Work can't be picked when one already exists.
  const openAddrForm = (base: Partial<AddrForm> = {}) => {
    const taken = new Set(addresses.map((a) => a.type));
    const type = !taken.has("home") ? "home" : !taken.has("work") ? "work" : "other";
    setAddrForm({ ...EMPTY_ADDR_FORM, type, ...base });
    setAddingAddress(true);
  };

  const saveNewAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) { toast.error("Please log in to continue"); return; }
    const f = addrForm;
    if (!f.line1.trim() || !f.line2.trim() || !f.city.trim() || !f.state.trim() || !f.country.trim() || !f.pincode.trim()) {
      toast.error("Please fill all required address details");
      return;
    }
    if (f.pincode.length !== 6) { toast.error("Pincode must be 6 digits"); return; }

    let finalType = f.type;
    let finalLabel: string | null = f.type === "other" ? f.label.trim() : null;
    if (finalType === "other" && finalLabel) {
      const lower = finalLabel.toLowerCase();
      if (lower === "home" || lower === "work") { finalType = lower; finalLabel = null; }
    }
    if (finalType === "other" && !finalLabel) { toast.error("Please name this address"); return; }

    // Home/Work are singular categories — only one of each per user. Catches both a direct
    // pick and an "other" label that normalized to home/work above.
    if ((finalType === "home" || finalType === "work") && addresses.some((a) => a.type === finalType)) {
      toast.error(`You already have a ${finalType} address — choose Work or Other.`);
      return;
    }

    // First address is always the default; otherwise honor the checkbox.
    const willBeDefault = f.is_default || addresses.length === 0;
    setSavingAddress(true);
    console.log(`[Checkout] saving new address  type=${finalType}  default=${willBeDefault}`);
    try {
      // Keep a single default: clear the existing default if this new one takes over.
      if (willBeDefault && addresses.length > 0) {
        const { error: clrErr } = await supabase
          .from("addresses").update({ is_default: false })
          .eq("user_id", userId).eq("is_default", true);
        if (clrErr) throw clrErr;
      }
      const payload = {
        user_id: userId,
        type: finalType,
        label: finalLabel,
        line1: f.line1.trim(),
        line2: f.line2.trim(),
        landmark: f.landmark.trim(),
        city: f.city.trim(),
        state: f.state.trim(),
        country: f.country.trim(),
        pincode: f.pincode.trim(),
        is_default: willBeDefault,
      };
      const { data, error } = await supabase.from("addresses").insert(payload).select().single();
      if (error) throw error;
      const newAddr = data as Address;
      console.log(`[Checkout] address saved  id=${newAddr.id}  → selecting it`);
      setAddresses((prev) => {
        const cleared = willBeDefault ? prev.map((a) => ({ ...a, is_default: false })) : prev;
        return [newAddr, ...cleared];
      });
      setSelectedAddressId(newAddr.id);
      setAddrForm(EMPTY_ADDR_FORM);
      setAddingAddress(false);
      toast.success("Address saved");
    } catch (err) {
      console.error("[Checkout] save address failed", err);
      toast.error(err instanceof Error ? err.message : "Could not save address");
    } finally {
      setSavingAddress(false);
    }
  };

  // ── Order summary lines (cart from context, direct from the passed item) ──────
  const summaryLines = useMemo(() => {
    if (mode === "direct" && directItem) {
      return [
        {
          key: `${directItem.sku}-${directItem.size}`,
          title: directItem.title ?? "Item",
          image: directItem.image ?? "",
          price: directItem.price ?? 0,
          originalPrice: directItem.originalPrice ?? directItem.price ?? 0,
          quantity: directItem.quantity,
          size: directItem.size,
          colorName: directItem.colorName ?? "",
        },
      ];
    }
    return cartItemsForCheckout.map((it) => ({
      key: it.id,
      title: it.title,
      image: it.image,
      price: it.price,
      originalPrice: it.originalPrice,
      quantity: it.quantity,
      size: it.size,
      colorName: it.color?.name ?? "",
    }));
  }, [mode, directItem, cartItemsForCheckout]);

  // The applied discount is the exact amount the backend returned for this coupon (every
  // coupon's discount is computed server-side). This summary is read-only, so the subtotal
  // it was validated against can't change here; /initiate re-validates and re-prices
  // authoritatively before charging regardless.
  const lineInputs = useMemo(
    () => summaryLines.map((l) => ({ price: l.price, originalPrice: l.originalPrice, quantity: l.quantity })),
    [summaryLines],
  );
  const discount = coupon?.discount ?? 0;
  const totals = computeCartTotals(lineInputs, discount);

  const applyCoupon = async (codeToApply?: string) => {
    const code = (codeToApply ?? couponInput).trim().toUpperCase();
    if (!code) return;
    setCouponChecking(true);
    setCouponMsg("");
    console.log(`[Checkout] validating coupon "${code}"  subtotal=${totals.subtotal}`);
    try {
      const res = await validateCoupon(code, totals.subtotal);
      console.log(`[Checkout] coupon "${code}" → valid=${res.valid}  discount=${res.discount}  (${res.reason})`);
      if (res.valid) {
        setCoupon({ code, discount: res.discount });
        setCouponMsg(res.reason);
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 1500);
        toast.success(res.reason);
      } else {
        setCoupon(null);
        setCouponMsg(res.reason);
        toast.error(res.reason);
      }
    } catch (e) {
      setCoupon(null);
      setCouponMsg(e instanceof Error ? e.message : "Could not apply coupon");
    } finally {
      setCouponChecking(false);
      setShowCoupons(false);
    }
  };

  const finishPayment = async (resp: RazorpaySuccess) => {
    console.log(`[Checkout] payment returned  paymentId=${resp.razorpay_payment_id}  rzpOrder=${resp.razorpay_order_id}  verifying…`);
    try {
      const { orderId, orderNumber } = await verifyCheckout(resp);
      console.log(`[Checkout] verified → order ${orderNumber} (${orderId})  refetchCart=${mode === "cart"}  navigating to order page`);
      if (mode === "cart") refetchCart();
      toast.success("Payment successful!");
      navigate(`/orders/${orderId}?placed=1`);
    } catch (e) {
      console.error("[Checkout] verify failed", e);
      toast.error(e instanceof Error ? e.message : "Payment verification failed");
      setPaying(false);
    }
  };

  const handlePay = async () => {
    if (!user) {
      toast.error("Please log in to continue");
      return;
    }
    if (summaryLines.length === 0) {
      toast.error("Nothing to checkout");
      return;
    }
    if (!selectedAddressId) {
      toast.error("Please select a delivery address");
      return;
    }

    console.log(`[Checkout] Pay clicked  mode=${mode}  addressId=${selectedAddressId}  coupon=${coupon?.code ?? "none"}  total=₹${totals.total}`);
    setPaying(true);
    try {
      const scriptOk = await loadRazorpayScript();
      console.log(`[Checkout] Razorpay script ready: ${scriptOk}`);
      if (!scriptOk || !window.Razorpay) {
        toast.error("Could not load the payment window. Check your connection and try again.");
        setPaying(false);
        return;
      }

      const payload: InitiatePayload = {
        mode,
        addressId: selectedAddressId,
        ...(coupon ? { couponCode: coupon.code } : {}),
        ...(mode === "cart" && selectedItemIds ? { itemIds: selectedItemIds } : {}),
        ...(mode === "direct" && directItem
          ? {
              item: {
                product_slug: directItem.product_slug,
                sku: directItem.sku,
                size: directItem.size,
                quantity: directItem.quantity,
              },
            }
          : {}),
      };
      const init = await initiateCheckout(payload);
      console.log(`[Checkout] initiated  rzpOrder=${init.razorpayOrderId}  amount=${init.amount}p  total=₹${init.pricing.total}  → opening Razorpay modal`);

      // The backend drops any cart line it can no longer fully stock and prices only the
      // rest (so one out-of-stock item never blocks the whole order). Tell the customer why
      // the amount they're about to pay is lower than the summary — the Razorpay modal below
      // shows the authoritative, reduced amount.
      if (mode === "cart" && init.pricing.items.length < summaryLines.length) {
        const dropped = summaryLines.length - init.pricing.items.length;
        console.warn(`[Checkout] ${dropped} line(s) excluded as out of stock — charging for ${init.pricing.items.length} of ${summaryLines.length}`);
        toast.warning(`${dropped} item${dropped > 1 ? "s are" : " is"} out of stock and won't be charged. Paying for the rest.`);
      }

      const rzp = new window.Razorpay({
        key: init.keyId,
        amount: init.amount,
        currency: init.currency,
        name: "The Lil Edit",
        description: mode === "direct" ? "Buy Now" : "Order payment",
        order_id: init.razorpayOrderId,
        prefill: {
          name: profile?.first_name || undefined,
          email: user.email ?? undefined,
          contact: profile?.phone_number ?? undefined,
        },
        theme: { color: "#0f766e" },
        handler: (resp: RazorpaySuccess) => {
          void finishPayment(resp);
        },
        modal: {
          ondismiss: () => {
            console.log("[Checkout] razorpay modal dismissed");
            setPaying(false);
            toast("Payment cancelled");
          },
        },
      });
      rzp.open();
      console.log("[Checkout] Razorpay modal opened — awaiting payment");
    } catch (e) {
      console.error("[Checkout] initiate/pay failed", e);
      // Most pre-payment failures (e.g. an item no longer available) are fixed in the
      // bag, so offer a one-tap path there.
      toast.error(e instanceof Error ? e.message : "Could not start checkout", {
        action: { label: "Go to bag", onClick: () => navigate("/cart") },
      });
      setPaying(false);
    }
  };

  const ADDR_TYPES = ["home", "work", "other"] as const;

  const handlePillPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = addrSliderRef.current;
    if (!container) return;
    const slotWidth = container.offsetWidth / 3;
    const startX = e.clientX;
    const startIdx = ADDR_TYPES.indexOf(addrFormRef.current.type as typeof ADDR_TYPES[number]);

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const raw = startIdx * 100 + (delta / slotWidth) * 100;
      setDragPillPct(Math.max(0, Math.min(200, raw)));
    };

    const onUp = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const rawIdx = startIdx + delta / slotWidth;
      let snapped = Math.round(Math.max(0, Math.min(2, rawIdx)));
      const isTaken = (i: number) => {
        const t = ADDR_TYPES[i];
        return (t === "home" || t === "work") && addressesRef.current.some((a) => a.type === t);
      };
      if (isTaken(snapped)) snapped = startIdx;
      setAddrForm({ ...addrFormRef.current, type: ADDR_TYPES[snapped] });
      setDragPillPct(null);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const cartEmpty = mode === "cart" && !cartLoading && summaryLines.length === 0;
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col text-gray-900 overflow-x-hidden">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1 flex flex-col w-full pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)]">
        {/* Breadcrumb */}
        <div className="page-container px-4 sm:px-6 pt-3 pb-2 mt-1.5">
          <div className="flex flex-wrap items-center text-base text-gray-600 gap-1 mb-3">
            <Link to="/" className="hover:underline">Home</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <Link to="/cart" className="hover:underline">Your Bag</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-gray-800 font-medium">Checkout</span>
          </div>
        </div>

        <section className="page-container flex-1 w-full flex flex-col lg:flex-row gap-6 lg:gap-10 pb-12 px-3 sm:px-6">
          {/* LEFT: address + items */}
          <div className="flex-1 lg:w-[60%] space-y-6">
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 flex items-center gap-2">
              <Lock className="w-6 h-6 text-brand-teal" /> Secure Checkout
            </h1>

            {/* Address */}
            <div className="bg-white border border-gray-400 rounded-lg p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-brand-teal" /> Delivery Address
                </h2>
                {!addressesLoading && !addingAddress && addresses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openAddrForm()}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-teal hover:underline"
                  >
                    <Plus className="w-4 h-4" /> Add new
                  </button>
                )}
              </div>

              {addressesLoading ? (
                <p className="text-sm text-gray-500">Loading your addresses…</p>
              ) : (
                <>
                  {addresses.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[...addresses].sort((a, b) => Number(b.is_default) - Number(a.is_default)).map((addr) => {
                        const selected = addr.id === selectedAddressId;
                        return (
                          <button
                            key={addr.id}
                            type="button"
                            onClick={() => setSelectedAddressId(addr.id)}
                            className={`text-left p-4 rounded-md border transition-all relative ${
                              selected ? "border-brand-teal ring-1 ring-brand-teal bg-brand-teal/5" : "border-gray-300 hover:border-gray-400"
                            }`}
                          >
                            {selected && (
                              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-teal text-white flex items-center justify-center">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                            <p className="font-semibold text-gray-800 capitalize pr-6">
                              {addr.type === "other" ? addr.label : addr.type}
                              {addr.is_default && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-[8px] text-[10px] font-medium bg-teal-100 text-teal-800 border border-teal-800">Default</span>
                              )}
                            </p>
                            <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                              <p className="line-clamp-1">{addr.line1}</p>
                              {addr.line2 && <p className="line-clamp-1">{addr.line2}</p>}
                              <p>{addr.city}, {addr.state} - {addr.pincode}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {!addingAddress && addresses.length === 0 && (
                    <div className="text-center py-8 border border-dashed border-gray-300 rounded-md">
                      <p className="text-sm text-gray-600 mb-3">You don't have a saved address yet.</p>
                      <button
                        type="button"
                        onClick={() => openAddrForm({ is_default: true })}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-teal hover:underline"
                      >
                        <Plus className="w-4 h-4" /> Add a delivery address
                      </button>
                    </div>
                  )}

                  {addingAddress && (
                    <form onSubmit={saveNewAddress} className="mt-4 border border-gray-400 rounded-md p-4 bg-gray-100 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Address Type</label>
                          <div
                            ref={addrSliderRef}
                            className="relative flex rounded-md border border-gray-300 bg-gray-100 overflow-hidden w-full h-[38px] select-none"
                          >
                            {/* draggable sliding pill */}
                            <div
                              onPointerDown={handlePillPointerDown}
                              className={`absolute inset-y-0 w-1/3 bg-brand-teal cursor-grab active:cursor-grabbing touch-none ${dragPillPct === null ? "transition-transform duration-200 ease-in-out" : ""}`}
                              style={{ transform: `translateX(${dragPillPct ?? ADDR_TYPES.indexOf(addrForm.type as typeof ADDR_TYPES[number]) * 100}%)` }}
                            />
                            {ADDR_TYPES.map((type, i) => {
                              const taken = (type === "home" || type === "work") && addresses.some((a) => a.type === type);
                              const active = addrForm.type === type;
                              return (
                                <button
                                  key={type}
                                  type="button"
                                  disabled={taken}
                                  onClick={() => setAddrForm({ ...addrForm, type })}
                                  className={`relative z-10 flex-1 text-sm capitalize font-medium transition-colors pointer-events-auto ${i > 0 ? "border-l border-gray-300" : ""} ${
                                    active
                                      ? "text-white"
                                      : taken
                                      ? "text-gray-400 cursor-not-allowed"
                                      : "text-gray-600 hover:text-gray-800"
                                  }`}
                                >
                                  {type}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {addrForm.type === "other" && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-rose-500">*</span></label>
                            <input
                              value={addrForm.label}
                              onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })}
                              placeholder="e.g. Gym, Hostel"
                              className={ADDR_INPUT_CLS}
                            />
                          </div>
                        )}
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1 <span className="text-rose-500">*</span></label>
                          <input
                            value={addrForm.line1}
                            onChange={(e) => setAddrForm({ ...addrForm, line1: e.target.value })}
                            placeholder="Apartment, unit, building, floor"
                            className={ADDR_INPUT_CLS}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 2 <span className="text-rose-500">*</span></label>
                          <input
                            value={addrForm.line2}
                            onChange={(e) => setAddrForm({ ...addrForm, line2: e.target.value })}
                            placeholder="Street address"
                            className={ADDR_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Pincode <span className="text-rose-500">*</span></label>
                          <input
                            value={addrForm.pincode}
                            onChange={handleAddrPincode}
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="6-digit"
                            className={ADDR_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Landmark</label>
                          <input
                            value={addrForm.landmark}
                            onChange={(e) => setAddrForm({ ...addrForm, landmark: e.target.value })}
                            placeholder="Optional"
                            className={ADDR_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">City <span className="text-rose-500">*</span></label>
                          <input
                            value={addrForm.city}
                            onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })}
                            className={ADDR_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">State <span className="text-rose-500">*</span></label>
                          <input
                            value={addrForm.state}
                            onChange={(e) => setAddrForm({ ...addrForm, state: e.target.value })}
                            className={ADDR_INPUT_CLS}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Country <span className="text-rose-500">*</span></label>
                          <input
                            value={addrForm.country}
                            onChange={(e) => setAddrForm({ ...addrForm, country: e.target.value })}
                            className={ADDR_INPUT_CLS}
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={addrForm.is_default || addresses.length === 0}
                          onChange={(e) => setAddrForm({ ...addrForm, is_default: e.target.checked })}
                          disabled={addresses.length === 0}
                          className="w-4 h-4 accent-brand-teal rounded disabled:opacity-60"
                        />
                        Set as default address
                      </label>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => { setAddingAddress(false); setAddrForm(EMPTY_ADDR_FORM); }}
                          disabled={savingAddress}
                          className="text-sm font-medium text-gray-600 hover:text-gray-800 px-4 h-10 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <Button
                          type="submit"
                          disabled={savingAddress}
                          className="bg-brand-teal hover:bg-[#0C5D53] text-white rounded-lg px-5 h-10 text-sm font-semibold flex items-center gap-2"
                        >
                          {savingAddress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          {savingAddress ? "Saving…" : "Save address"}
                        </Button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>

            {/* Items */}
            <div className="bg-white border border-gray-400 rounded-lg p-4 sm:p-5 shadow-sm">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                {mode === "direct" ? "Your Item" : `Your Bag (${summaryLines.length})`}
              </h2>

              {cartEmpty ? (
                <div className="text-center py-8">
                  <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-4">Your cart is empty.</p>
                  <Link to="/">
                    <Button className="bg-brand-teal hover:bg-[#0C5D53] text-white rounded-lg px-6">Continue Shopping</Button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-400">
                  {summaryLines.map((line) => (
                    <div key={line.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="w-16 h-16 rounded-md overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                        {line.image ? (
                          <img
                            src={line.image}
                            alt={line.title}
                            loading="lazy"
                            onError={(e) => { e.currentTarget.src = "/fallback-product.webp"; }}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <Package size={18} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 line-clamp-2">{line.title}</p>
                        <div className="mt-1 text-xs text-gray-600 flex flex-wrap gap-x-3">
                          {line.size && <span>Size: {line.size}</span>}
                          {line.colorName && <span>{line.colorName}</span>}
                          <span>Qty: {line.quantity}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-brand-teal">{inr(line.price * line.quantity)}</p>
                        {line.originalPrice > line.price && (
                          <p className="text-[11px] text-gray-500 line-through">{inr(line.originalPrice * line.quantity)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: summary + pay */}
          <aside className="w-full lg:w-[34%] self-start lg:sticky lg:top-6 lg:mt-[60px]">
            <Card className="bg-[hsl(268_45%_87%)] backdrop-blur-sm border border-[hsl(268_45%_77%)] shadow-lg rounded-2xl lg:rounded-3xl p-3 sm:p-5 lg:p-6 flex flex-col gap-4 sm:gap-5">
              <h3 className="order-0 text-xl sm:text-2xl font-semibold text-gray-900">Order Summary</h3>

              {/* Coupon */}
              <div className="relative order-3">
                {celebrating && (
                  <div className="absolute inset-x-0 pointer-events-none z-50 overflow-visible" style={{ top: 16 }}>
                    {["🎉","✨","🎊","⭐","💫","🎉","✨","🎊","⭐","💫"].map((emoji, i, arr) => {
                      const spread = arr.length === 1 ? 0 : (i / (arr.length - 1) - 0.5) * 2; // -1 (left) → 1 (right)
                      const arc = 1 - spread * spread; // parabola: 1 at center, 0 at edges
                      const tx = Math.round(spread * 130 + (Math.random() - 0.5) * 30);
                      const ty = -Math.round(80 + arc * 95 + Math.random() * 25); // upward; center flies highest
                      const rot = Math.round(spread * 65 + (Math.random() - 0.5) * 45);
                      return (
                        <span
                          key={i}
                          className="absolute left-1/2 -ml-3 text-xl select-none will-change-transform"
                          style={{
                            "--tx": `${tx}px`, "--ty": `${ty}px`, "--rot": `${rot}deg`,
                            animation: `coupon-emoji-fly ${1 + Math.random() * 0.45}s cubic-bezier(0.18, 0.72, 0.32, 1) forwards`,
                          } as React.CSSProperties}
                        >
                          {emoji}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-row gap-2">
                  <div className="relative flex-1" ref={couponContainerRef}>
                    <Input
                      placeholder="Enter coupon code"
                      value={couponInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCouponInput(val);
                        if (coupon && val.trim().toUpperCase() !== coupon.code) {
                          setCoupon(null);
                          setCouponMsg("");
                        }
                      }}
                      onFocus={() => setShowCoupons(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void applyCoupon();
                        }
                      }}
                      className={`w-full h-[41px] rounded-lg text-sm bg-white focus-visible:ring-0 focus-visible:ring-offset-0 ${
                        coupon || couponInput.trim()
                          ? "border-brand-teal/60 text-brand-teal font-extrabold"
                          : ""
                      }`}
                      disabled={paying}
                    />
                    {showCoupons && (
                      <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="p-2.5 border-b border-gray-100 text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-brand-teal" />
                          Available Coupons
                        </div>
                        {!couponsLoaded ? (
                          <div className="p-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Loading coupons…
                          </div>
                        ) : activeCoupons.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400">
                            No coupons available right now
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-500">
                            {[...activeCoupons]
                              .sort((a, b) => {
                                if (a.applicable !== b.applicable) return a.applicable ? -1 : 1;
                                if (a.applicable) return computeCouponSavings(b, couponSubtotal) - computeCouponSavings(a, couponSubtotal);
                                return 0;
                              })
                              .map((c) => {
                              const discountText = formatCouponSavings(couponSubtotal, c);
                              const couponOfferText = formatCouponOffer(c);
                              const ruleBadge = c.first_order_only
                                ? "First Order Only"
                                : c.once_per_user
                                ? "Once Per User"
                                : "";

                              if (c.applicable) {
                                return (
                                  <button
                                    key={c.code}
                                    type="button"
                                    onMouseDown={() => {
                                      setCouponInput(c.code);
                                      void applyCoupon(c.code);
                                    }}
                                    className="w-full text-left px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors flex flex-col gap-1"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-xs bg-brand-teal text-white border border-brand-teal px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                                        {c.code}
                                      </span>
                                      <span className="text-base font-bold text-brand-teal">{discountText}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 gap-1.5 mt-0.5">
                                      <span>{couponOfferText}</span>
                                      {ruleBadge && (
                                        <span className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-medium">
                                          {ruleBadge}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              }

                              const reasonText = c.reason || couponOfferText;
                              const isShortfallHint = reasonText.includes("to apply this coupon");

                              // Non-applicable: dark grey, not clickable
                              return (
                                <div
                                  key={c.code}
                                  className="w-full text-left px-3 py-2.5 flex flex-col gap-1 bg-gray-200 cursor-default select-none"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs bg-gray-300 text-gray-700 px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                                      {c.code}
                                    </span>
                                    <span className="text-base font-bold text-gray-600">{discountText}</span>
                                  </div>
                                  <div className="flex flex-wrap items-center justify-between text-xs gap-1.5 mt-0.5">
                                    <span className={`italic ${isShortfallHint ? "text-green-700 font-medium" : "text-gray-600"}`}>
                                      {reasonText}
                                    </span>
                                    {ruleBadge && (
                                        <span className="bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded font-medium">
                                        {ruleBadge}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => void applyCoupon()}
                    disabled={couponChecking || paying || !couponInput.trim()}
                    className="bg-brand-teal hover:bg-[#0C5D53] text-white rounded-lg px-5 h-[41px] text-sm font-semibold shrink-0 transition-colors"
                  >
                    {couponChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
                {couponMsg && (
                  <p className={`mt-1.5 text-xs flex items-center gap-1 ${
                    coupon || couponMsg.includes("to apply this coupon")
                      ? "text-green-700 font-medium"
                      : "text-rose-600 font-medium"
                  }`}>
                    <Tag className="w-3.5 h-3.5 shrink-0" /> {couponMsg}
                  </p>
                )}
              </div>

              <div className="order-1 space-y-3 sm:space-y-4 text-sm sm:text-base">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{inr(totals.subtotal)}</span>
                </div>
                {totals.totalSavings > 0 && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>You save</span>
                    <span>-{inr(totals.totalSavings)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery</span>
                  <span className="font-medium">{totals.shippingFee === 0 ? (totals.subtotal > 0 ? "Free" : "—") : inr(totals.shippingFee)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>COUPON{coupon ? ` (${coupon.code})` : ""}</span>
                    <span>-{inr(totals.discount)}</span>
                  </div>
                )}
              </div>

              <div className="order-2 border-t border-gray-400 pt-4 flex justify-between items-center">
                <span className="text-base sm:text-lg font-semibold">Total</span>
                <span className="text-xl sm:text-2xl font-bold text-brand-teal">{inr(totals.total)}</span>
              </div>

              {/* Payment method selector */}
              <div className="order-4 space-y-2">
                <p className="text-sm font-semibold text-gray-700">Payment Method</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-brand-teal bg-white">
                    <div className="w-4 h-4 rounded-full border-2 border-brand-teal flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 rounded-full bg-brand-teal" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">Pay Online</p>
                      <p className="text-xs text-gray-500">UPI, Cards, Net Banking & more</p>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-brand-teal shrink-0" />
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-400 bg-gray-200 cursor-not-allowed select-none">
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-600">Cash on Delivery</p>
                      <p className="text-xs text-gray-500">Currently unavailable</p>
                    </div>
                    <Banknote className="w-4 h-4 text-gray-300 shrink-0" />
                  </div>
                </div>
              </div>

              <Button
                onClick={() => void handlePay()}
                disabled={paying || summaryLines.length === 0 || !selectedAddressId}
                className="order-5 w-full bg-brand-teal hover:bg-[#0C5D53] text-white py-3 sm:py-4 rounded-lg font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-colors"
              >
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock size={14} />}
                {paying ? "Processing…" : `Pay ${inr(totals.total)}`}
              </Button>

              {!selectedAddressId && addresses.length > 0 && (
                <p className="order-6 text-xs text-rose-600 text-center -mt-2">Select a delivery address to continue.</p>
              )}

              <div className="order-7 grid grid-cols-3 gap-2 pt-1 sm:pt-2">
                <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 flex flex-col items-center gap-1 text-xs font-medium text-gray-700">
                  <Sparkles size={14} className="text-purple-500" />
                  Classy Styles
                </div>
                <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 flex flex-col items-center gap-1 text-xs font-medium text-gray-700">
                  <ShieldCheck size={14} className="text-brand-teal" />
                  Safe Payments
                </div>
                <div className="bg-[#FAF9F7] rounded-lg sm:rounded-xl py-2 sm:py-3 flex flex-col items-center gap-1 text-xs font-medium text-gray-700">
                  <Award size={14} className="text-amber-500" />
                  Premium Quality
                </div>
              </div>

              {selectedAddress && (
                <p className="order-8 text-xs text-gray-700 text-center">
                  Delivering to {titleCase(selectedAddress.type === "other" ? (selectedAddress.label ?? "Other") : selectedAddress.type)} <span className="relative top-[2px] text-lg leading-none">·</span> {selectedAddress.city}
                </p>
              )}
            </Card>
          </aside>
        </section>
      </main>

      <Footer />
    </div>
  );
}
