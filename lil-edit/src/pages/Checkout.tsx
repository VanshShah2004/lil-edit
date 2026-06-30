import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Lock, MapPin, Tag, Loader2, Check, ShieldCheck, Plus, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

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

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<string>("");
  const [couponChecking, setCouponChecking] = useState(false);

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
    return cartItems.map((it) => ({
      key: it.id,
      title: it.title,
      image: it.image,
      price: it.price,
      originalPrice: it.originalPrice,
      quantity: it.quantity,
      size: it.size,
      colorName: it.color?.name ?? "",
    }));
  }, [mode, directItem, cartItems]);

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

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
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
        <div className="page-container px-4 sm:px-6 pt-1 pb-6">
          <div className="flex flex-wrap items-center text-xs sm:text-sm text-gray-600 gap-y-2">
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
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-brand-teal" /> Delivery Address
              </h2>

              {addressesLoading ? (
                <p className="text-sm text-gray-500">Loading your addresses…</p>
              ) : addresses.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-gray-300 rounded-xl">
                  <p className="text-sm text-gray-600 mb-3">You don't have a saved address yet.</p>
                  <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-teal hover:underline">
                    <Plus className="w-4 h-4" /> Add an address in your profile
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {addresses.map((addr) => {
                    const selected = addr.id === selectedAddressId;
                    return (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`text-left p-4 rounded-xl border transition-all relative ${
                          selected ? "border-brand-teal ring-1 ring-brand-teal bg-brand-teal/5" : "border-gray-200 hover:border-gray-300"
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
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-teal-100 text-teal-800">Default</span>
                          )}
                        </p>
                        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                          <p className="line-clamp-1">{addr.line1}</p>
                          {addr.line2 && <p className="line-clamp-1">{addr.line2}</p>}
                          <p>{addr.city}, {addr.state} - {addr.pincode}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3">
                {mode === "direct" ? "Your Item" : `Your Bag (${summaryLines.length})`}
              </h2>

              {cartEmpty ? (
                <div className="text-center py-8">
                  <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-4">Your cart is empty.</p>
                  <Link to="/">
                    <Button className="bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full px-6">Continue Shopping</Button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {summaryLines.map((line) => (
                    <div key={line.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
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
                        <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-x-3">
                          {line.size && <span>Size: {line.size}</span>}
                          {line.colorName && <span>{line.colorName}</span>}
                          <span>Qty: {line.quantity}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-brand-teal">{inr(line.price * line.quantity)}</p>
                        {line.originalPrice > line.price && (
                          <p className="text-[11px] text-gray-400 line-through">{inr(line.originalPrice * line.quantity)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: summary + pay */}
          <aside className="w-full lg:w-[40%] self-start lg:sticky lg:top-6">
            <div className="bg-[hsl(268_45%_87%)] border border-[hsl(268_45%_77%)] shadow-lg rounded-2xl lg:rounded-3xl p-4 sm:p-6 space-y-5">
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900">Order Summary</h3>

              {/* Coupon */}
              <div>
                <div className="flex flex-row gap-2">
                  <Input
                    placeholder="Coupon code"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyCoupon(); } }}
                    className="flex-1 h-11 rounded-full text-sm bg-white"
                    disabled={paying}
                  />
                  <Button
                    onClick={() => void applyCoupon()}
                    disabled={couponChecking || paying || !couponInput.trim()}
                    className="bg-brand-teal hover:bg-[#0C5D53] text-white rounded-full px-5 h-11 text-sm font-semibold shrink-0"
                  >
                    {couponChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
                {couponMsg && (
                  <p className={`mt-1.5 text-xs flex items-center gap-1 ${coupon ? "text-green-700" : "text-rose-600"}`}>
                    <Tag className="w-3 h-3" /> {couponMsg}
                  </p>
                )}
              </div>

              <div className="space-y-3 text-sm sm:text-base border-t border-purple-300 pt-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{inr(totals.subtotal)}</span>
                </div>
                {totals.totalSavings > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>You save</span>
                    <span>-{inr(totals.totalSavings)}</span>
                  </div>
                )}
                {totals.discount > 0 && (
                  <div className="flex justify-between text-green-700 font-medium">
                    <span>Coupon{coupon ? ` (${coupon.code})` : ""}</span>
                    <span>-{inr(totals.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery</span>
                  <span className="font-medium">{totals.shippingFee === 0 ? (totals.subtotal > 0 ? "Free" : "—") : inr(totals.shippingFee)}</span>
                </div>
              </div>

              <div className="border-t border-purple-300 pt-4 flex justify-between items-center">
                <span className="text-base sm:text-lg font-semibold">Total</span>
                <span className="text-xl sm:text-2xl font-bold text-brand-teal">{inr(totals.total)}</span>
              </div>

              <Button
                onClick={() => void handlePay()}
                disabled={paying || summaryLines.length === 0 || !selectedAddressId}
                className="w-full bg-brand-teal hover:bg-[#0C5D53] text-white py-3 sm:py-4 rounded-full font-semibold text-sm sm:text-base flex items-center justify-center gap-2"
              >
                {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock size={14} />}
                {paying ? "Processing…" : `Pay ${inr(totals.total)}`}
              </Button>

              {!selectedAddressId && addresses.length > 0 && (
                <p className="text-xs text-rose-600 text-center -mt-2">Select a delivery address to continue.</p>
              )}

              <p className="flex items-center justify-center gap-1.5 text-xs text-gray-600">
                <ShieldCheck size={14} className="text-brand-teal" /> Secured by Razorpay
              </p>

              {selectedAddress && (
                <p className="text-[11px] text-gray-500 text-center">
                  Delivering to {selectedAddress.type === "other" ? selectedAddress.label : selectedAddress.type} · {selectedAddress.city}
                </p>
              )}
            </div>
          </aside>
        </section>
      </main>

      <Footer />
    </div>
  );
}
