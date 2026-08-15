import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Link2, MoreHorizontal, Check } from "lucide-react";
import {
  FaFacebook,
  FaTwitter,
  FaWhatsapp,
  FaInstagram,
  FaTelegramPlane,
  FaPinterestP,
  FaSnapchatGhost,
  FaRedditAlien,
} from "react-icons/fa";
import { IoChatbubbleEllipses } from "react-icons/io5";
import { toast } from "sonner";
import { buildPdpUrl } from "@/lib/pdpUrl";

export interface ShareSheetProduct {
  categorySlug: string;
  slug: string;
  sku: string;
  title: string;
  brand: string;
  price: number;
  originalPrice: number;
  image: string;
}

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  product: ShareSheetProduct | null;
}

type SharePlatform =
  | "whatsapp"
  | "twitter"
  | "facebook"
  | "instagram"
  | "telegram"
  | "sms"
  | "email"
  | "pinterest"
  | "snapchat"
  | "reddit"
  | "more";

/**
 * Reusable share bottom-sheet (slide-up on mobile, centered card on desktop).
 * Mirrors the PDP share experience — branded copy, per-platform intents, a
 * native OS share sheet with the product photo attached, and copy-to-clipboard.
 */
const ShareSheet = ({ open, onClose, product }: ShareSheetProps) => {
  const [copied, setCopied] = useState(false);
  const [isDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : false,
  );

  // Share the canonical PDP URL itself. Link-preview crawlers (WhatsApp/iMessage/
  // Telegram/FB…) don't run JS, so a plain SPA shell would give them nothing to
  // render — the static host rewrites this exact path to the backend, which returns
  // the same shell with OG tags injected (primary image (variant-aware), product
  // name, description, price). See render.yaml + backend/routes/pdpShell.ts.
  // Result: the shared link unfurls into a product card AND is the real product URL
  // — no redirect hop and no api.* host in the message.
  const shareUrl = product
    ? buildPdpUrl(product.categorySlug, product.slug, product.sku)
    : "";
  const websiteUrl = typeof window !== "undefined" ? window.location.origin : "";
  const discountPercent =
    product && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : 0;

  // Branded share copy. shareFullText embeds both links for free-text channels
  // (WhatsApp / SMS / email / Instagram / native share). shareCaption omits the
  // product link for channels that take it as a separate param. shareTitle is a
  // one-liner for title-only fields (Reddit / native sheet).
  const shareHook = product
    ? `Main Character Fit Detected. 👑\n\nMeet ${product.title}—your next wardrobe obsession. ✨`
    : "";
  const shareSignoff = `The Lil Edit\nCulture Meets Cool.`;
  const shareFullText = `${shareHook}\n\nGet yours:\n${shareUrl} 🛍️\n\nDiscover more styles:\n${websiteUrl}\n\n${shareSignoff}`;
  const shareCaption = `${shareHook}\n\nDiscover more styles:\n${websiteUrl}\n\n${shareSignoff}`;
  const shareTitle = product ? `Main Character Fit Detected — Meet ${product.title} ✨` : "";

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Prefetch the hero photo as a File the moment the sheet opens, so a native
  // share can attach the actual product image synchronously within the user's
  // tap (Web Share API Level 2). Stored as a Promise so a tap before the fetch
  // settles still resolves to the file. Cleared when the sheet closes.
  // Keyed on the image/slug primitives (not the whole product object) so callers
  // passing an inline object literal don't re-trigger the fetch every render.
  const shareImg = product?.image;
  const shareSlug = product?.slug;
  const shareImageRef = useRef<Promise<File | null> | null>(null);
  useEffect(() => {
    if (!open || !shareImg) {
      shareImageRef.current = null;
      return;
    }
    shareImageRef.current = (async () => {
      try {
        console.log("[share-image] fetching", shareImg);
        const res = await fetch(shareImg, { mode: "cors" });
        if (!res.ok) {
          console.warn("[share-image] fetch failed  status=", res.status);
          return null;
        }
        const blob = await res.blob();
        const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        const file = new File([blob], `${shareSlug}.${ext}`, { type: blob.type });
        console.log("[share-image] ready", { type: blob.type, sizeKB: Math.round(blob.size / 1024), name: file.name });
        return file;
      } catch (err) {
        console.warn("[share-image] fetch error (likely CORS on the image host) —", err);
        return null;
      }
    })();
  }, [open, shareImg, shareSlug]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Native OS share sheet. Attaches the product photo when the platform supports
  // file sharing, otherwise shares text + link, otherwise copies to clipboard.
  // When files are attached, the caption carries both links since many targets
  // drop the separate `url` field in that case.
  const handleNativeShare = async () => {
    const file = shareImageRef.current ? await shareImageRef.current : null;
    const canShareFile = !!file && !!navigator.canShare?.({ files: [file] });
    console.log("[share-native] file=", !!file, " canShareFile=", canShareFile, " hasShareApi=", !!navigator.share);
    try {
      if (canShareFile && file) {
        await navigator.share({ title: shareTitle, text: shareFullText, files: [file] });
        console.log("[share-native] shared WITH photo");
        onClose();
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareCaption, url: shareUrl });
        console.log("[share-native] shared text only — this device can't attach files");
        onClose();
        return;
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        console.log("[share-native] dismissed by user");
        onClose();
        return;
      }
      console.warn("[share-native] share error —", err);
    }
    navigator.clipboard.writeText(shareFullText);
    toast.success("Caption copied to clipboard");
    onClose();
  };

  const handleShare = (platform: SharePlatform) => {
    let url = "";
    switch (platform) {
      case "whatsapp":
        url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareFullText)}`;
        break;
      case "twitter":
        url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareCaption)}`;
        break;
      case "facebook":
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareCaption)}`;
        break;
      case "instagram":
        navigator.clipboard.writeText(shareFullText);
        toast.success("Caption copied! Paste it in your Instagram story or DM");
        onClose();
        return;
      case "telegram":
        url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareCaption)}`;
        break;
      case "sms":
        window.location.assign(`sms:?body=${encodeURIComponent(shareFullText)}`);
        onClose();
        return;
      case "email":
        window.location.assign(`mailto:?subject=${encodeURIComponent(`Meet ${product?.title ?? ""}✨`)}&body=${encodeURIComponent(shareFullText)}`);
        onClose();
        return;
      case "pinterest":
        url = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&description=${encodeURIComponent(shareCaption)}&media=${encodeURIComponent(product?.image || "")}`;
        break;
      case "snapchat":
        url = `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(shareUrl)}`;
        break;
      case "reddit":
        url = `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`;
        break;
      case "more":
        void handleNativeShare();
        return;
    }
    window.open(url, "_blank");
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && product && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[350] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          {/* Sheet – scale/fade on desktop, slide-up on mobile */}
          <motion.div
            className="fixed z-[351] bottom-0 inset-x-0 md:bottom-auto md:top-1/2 md:left-1/2 md:right-auto md:max-w-[440px] md:w-full md:rounded-3xl bg-white rounded-t-[28px] shadow-[0_-12px_60px_rgba(0,0,0,0.18)] md:shadow-2xl overflow-hidden"
            initial={isDesktop ? { opacity: 0, scale: 0.96, x: "-50%", y: "-50%" } : { opacity: 0.8, y: "100%" }}
            animate={isDesktop ? { opacity: 1, scale: 1, x: "-50%", y: "-50%" } : { opacity: 1, y: 0 }}
            exit={isDesktop ? { opacity: 0, scale: 0.96, x: "-50%", y: "-50%" } : { opacity: 0.8, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            style={{ maxHeight: "90dvh" }}
          >
            {/* Drag Handle (mobile only) */}
            <div className="md:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-[4px] rounded-full bg-gray-400" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 md:pt-5 pb-4">
              <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Share this product</h3>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors shrink-0"
              >
                <X size={15} className="text-gray-700" />
              </button>
            </div>

            {/* Product Preview Card */}
            <div className="mx-5 mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-slate-100 border border-gray-300 overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                <div className="relative w-[84px] h-[84px] rounded-xl overflow-hidden bg-white border border-gray-300 shrink-0 shadow-sm">
                  <img src={product.image || ""} alt={product.title} className="w-full h-full object-cover" />
                  {discountPercent > 0 && (
                    <div className="absolute top-0 left-0 bg-red-500 text-white text-[8px] font-bold px-1.5 py-[2px] rounded-br-lg">
                      {discountPercent}% OFF
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b5b55] mb-0.5">{product.brand}</p>
                  <p className="text-[14px] font-semibold text-slate-900 leading-snug line-clamp-2">{product.title}</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-[16px] font-bold text-slate-900">₹{product.price.toLocaleString()}</span>
                    {product.originalPrice > 0 && product.originalPrice > product.price && (
                      <span className="text-[12px] line-through text-gray-500 font-medium">₹{product.originalPrice.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* URL Preview Row */}
            <div className="mx-5 mb-5 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-100 border border-gray-300">
              <Link2 size={13} className="text-gray-500 shrink-0" />
              <span className="flex-1 text-[11px] text-gray-600 truncate font-mono">{shareUrl}</span>
              <motion.button
                onClick={handleCopyLink}
                animate={copied ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 0.25 }}
                title={copied ? "Copied!" : "Copy link"}
                className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  copied
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-white text-[#0b5b55] border border-gray-300 hover:border-[#0f766e]"
                }`}
              >
                {copied ? <Check size={13} /> : <Link2 size={13} />}
              </motion.button>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mx-5 mb-4" />

            {/* Social Platforms */}
            <div className="px-5 pb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-600 mb-3">Share via</p>
              <div className="relative">
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                  {[
                    { id: "whatsapp" as const, label: "WhatsApp", icon: <FaWhatsapp size={20} className="text-white" />, bg: "bg-[#25D366]" },
                    { id: "instagram" as const, label: "Instagram", icon: <FaInstagram size={20} className="text-white" />, bg: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]" },
                    { id: "pinterest" as const, label: "Pinterest", icon: <FaPinterestP size={20} className="text-white" />, bg: "bg-[#E60023]" },
                    { id: "telegram" as const, label: "Telegram", icon: <FaTelegramPlane size={20} className="text-white" />, bg: "bg-[#0088CC]" },
                    { id: "snapchat" as const, label: "Snapchat", icon: <FaSnapchatGhost size={18} className="text-black" />, bg: "bg-[#FFFC00]" },
                    { id: "reddit" as const, label: "Reddit", icon: <FaRedditAlien size={20} className="text-white" />, bg: "bg-[#FF4500]" },
                    { id: "twitter" as const, label: "Twitter", icon: <FaTwitter size={20} className="text-white" />, bg: "bg-[#1DA1F2]" },
                    { id: "facebook" as const, label: "Facebook", icon: <FaFacebook size={20} className="text-white" />, bg: "bg-[#1877F2]" },
                  ].map((item, i) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 * i, duration: 0.22, ease: "easeOut" }}
                      onClick={() => handleShare(item.id)}
                      className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer min-w-[58px]"
                    >
                      <div className={`w-[50px] h-[50px] rounded-2xl ${item.bg} flex items-center justify-center shadow-md group-hover:scale-110 group-active:scale-95 transition-all duration-200`}>
                        {item.icon}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap">{item.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>

            {/* Utility Row */}
            <div className="px-5 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] md:pb-5">
              <div className="flex gap-3 -mx-1 px-1">
                {[
                  { id: "sms", label: "Messages", icon: <IoChatbubbleEllipses size={20} className="text-white" />, bg: "bg-[#34C759]", action: "sms" as const },
                  { id: "email", label: "Email", icon: <Mail size={18} className="text-white" />, bg: "bg-slate-600", action: "email" as const },
                  {
                    id: "copy",
                    label: copied ? "Copied!" : "Copy Link",
                    icon: copied ? <Check size={18} className="text-emerald-700" /> : <Link2 size={18} className="text-slate-600" />,
                    bg: copied ? "bg-emerald-100" : "bg-gray-200",
                    action: "copy" as const,
                  },
                  { id: "more", label: "More", icon: <MoreHorizontal size={18} className="text-slate-600" />, bg: "bg-gray-200", action: "more" as const },
                ].map((item, i) => (
                  <motion.button
                    key={`util-${item.id}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.26 + 0.04 * i, duration: 0.22, ease: "easeOut" }}
                    onClick={() => (item.action === "copy" ? handleCopyLink() : handleShare(item.action))}
                    className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer min-w-[58px]"
                  >
                    <div className={`w-[50px] h-[50px] rounded-2xl ${item.bg} flex items-center justify-center shadow-sm group-hover:scale-110 group-active:scale-95 transition-all duration-200`}>
                      {item.icon}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap">{item.label}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default ShareSheet;
