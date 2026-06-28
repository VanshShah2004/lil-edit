import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Edit3,
  Trash2,
  Download,
  Plus,
  Package,
  ArrowLeft,
  Image as ImageIcon,
  FileText,
  Boxes,
  Activity,
  Zap,
  ExternalLink
} from "lucide-react";
import { getBackendBaseUrl } from "@/lib/backend";
import { authHeader } from "@/lib/apiAuth";
import { buildPayloadFromProduct } from "@/lib/buildProductPayload";
import { buildPdpPath, resolvePdpSku } from "@/lib/pdpUrl";
import UserNavbar from "@/components/home/UserNavbar";
import AdminSubNav from "@/components/admin/AdminSubNav";
import Navbar from "@/components/layout/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import logo from "@/assets/logo.png";

interface ProductImage {
  id: string;
  image_url: string;
  alt_text?: string;
  is_primary?: boolean;
  sort_order?: number;
  variant_id: string | null;
}

interface ProductVariant {
  id: string;
  color_name: string;
  color_hex: string;
  variant_sku: string;
  stock: number | null;
  is_unlimited: boolean;
  sort_order?: number;
}

interface ProductItem {
  id: string;
  title: string;
  base_sku: string;
  category: string;
  category_slug: string;
  price: number;
  original_price?: number;
  status: "DRAFT" | "PUBLISHED";
  slug: string;
  created_at: string;
  updated_at?: string;
  brand: string;
  fabric?: string;
  fit?: string;
  occasion?: string;
  care_instructions?: string;
  description_points?: string[];
  gender?: string;
  sizes?: string[];
  tags?: string[];
  badges?: string[];
  is_featured?: boolean;
  is_new_arrival?: boolean;
  is_bestseller?: boolean;
  is_trending?: boolean;
  product_images?: ProductImage[];
  draft_product_images?: ProductImage[];
  product_variants?: ProductVariant[];
  draft_product_variants?: ProductVariant[];
  image_url?: string;
  is_unlimited?: boolean;
}


const isPlaceholderDescription = (pts?: string[]) => {
  if (!pts || pts.length === 0) return true;
  if (pts.length === 1 && (
    pts[0] === "No product details added yet." ||
    pts[0].toLowerCase().includes("no product details") ||
    pts[0] === ""
  )) return true;
  return false;
};


interface ProductVersionViewProps {
  version: { type: "PUBLISHED" | "DRAFT"; data: ProductItem; label: string };
  isUpdate?: boolean;
  onEdit: (p: ProductItem) => void;
  onLaunch: (p: ProductItem) => void;
  onDelete: (p: ProductItem) => void;
  onDownloadPdf: (p: ProductItem) => void;
}

const ProductVersionView = ({ version, isUpdate, onEdit, onLaunch, onDelete, onDownloadPdf }: ProductVersionViewProps) => {
  const [activeImageTab, setActiveImageTab] = useState<string>("Global");
  const [activeImage, setActiveImage] = useState<string | null>(null);

  // Measure the version tag so the "View Product" button can match its exact width.
  const tagRef = useRef<HTMLDivElement>(null);
  const [tagWidth, setTagWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => setTagWidth(tagRef.current?.offsetWidth ?? null);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [version.label]);

  useEffect(() => {
    const images = version.type === "PUBLISHED" ? version.data.product_images : version.data.draft_product_images;
    const firstGlobal = images?.find(i => !i.variant_id)?.image_url ?? images?.[0]?.image_url ?? null;
    // Reset the previewed image when switching to a different version.
    setActiveImage(firstGlobal);
    // Keyed on version identity; image arrays are read once per version switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version.data.id]);

  const p = version.data;
  const images = version.type === "PUBLISHED" ? p.product_images ?? [] : p.draft_product_images ?? [];
  const variants = version.type === "PUBLISHED" ? p.product_variants ?? [] : p.draft_product_variants ?? [];

  return (
    <div className="space-y-10">
      {/* Summary Row */}
      <div className="space-y-8 relative">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{p.title}</h2>
            <div ref={tagRef} className="shrink-0 w-fit">
              <Badge className={`${version.type === "PUBLISHED"
                  ? "bg-gray-900 text-white hover:bg-gray-900"
                  : (isUpdate
                    ? "bg-gray-900 text-white hover:bg-gray-900"
                    : "bg-gray-200 text-gray-600 hover:bg-gray-200")
                } border-none rounded-sm h-7 sm:h-8 mt-[5px] text-[11px] sm:text-[10px] font-bold uppercase tracking-widest px-3 whitespace-nowrap`}>
                {version.label}
              </Badge>
            </div>
          </div>
          <p className="text-[13px] sm:text-[11px] font-bold text-gray-600 font-mono tracking-widest uppercase">{p.base_sku}</p>
          <p className="text-[13px] sm:text-[11px] font-bold text-gray-600 font-mono tracking-widest lowercase">{p.slug}</p>
        </div>

        {version.type === "PUBLISHED" && (
          <button
            onClick={() => window.open(buildPdpPath(p.category_slug, p.slug, resolvePdpSku(p.base_sku, variants.map((v) => ({ sku: v.variant_sku })))), "_blank", "noopener,noreferrer")}
            style={tagWidth ? ({ "--tag-w": `${tagWidth}px` } as React.CSSProperties) : undefined}
            className="flex w-full sm:w-[var(--tag-w,auto)] sm:absolute sm:right-0 sm:top-[17px] sm:h-8 items-center justify-center gap-2 px-4 py-3 sm:px-3 sm:py-0 rounded sm:rounded-sm bg-[#0F766E] text-white font-bold text-[11px] sm:text-[10px] uppercase tracking-widest hover:brightness-110 transition-all"
          >
            <ExternalLink size={14} /> View Product
          </button>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-[28px] md:gap-12 sm:pt-4">
          <div className="flex-1">
            <div className="grid grid-cols-2 gap-x-12 gap-y-8 py-6">
              <div className="space-y-1">
                <p className="text-[11px] sm:text-[9px] font-bold text-gray-600 uppercase tracking-wider">Brand House</p>
                <p className="text-sm sm:text-xs font-bold text-gray-900">{p.brand}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] sm:text-[9px] font-bold text-gray-600 uppercase tracking-wider">Category</p>
                <p className="text-sm sm:text-xs font-bold text-gray-900">{p.category}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] sm:text-[9px] font-bold text-gray-600 uppercase tracking-wider">Selling Price (INR)</p>
                <p className="text-sm sm:text-xs font-bold text-gray-900">₹{p.price.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] sm:text-[9px] font-bold text-gray-600 uppercase tracking-wider">MRP / Original Price</p>
                <p className="text-sm sm:text-xs font-bold text-gray-900">
                  {p.original_price ? `₹${p.original_price.toLocaleString()}` : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto flex flex-col gap-3">
            <div className="flex gap-3">
              <button onClick={() => onEdit(p)} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white rounded font-bold text-[11px] sm:text-[10px] uppercase tracking-widest whitespace-nowrap border border-black hover:bg-gray-800 transition-all">
                <Edit3 size={14} /> {version.type === "PUBLISHED" ? "Update" : "Edit Draft"}
              </button>
              <button onClick={() => onDownloadPdf(p)} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-gray-500 text-gray-600 rounded font-bold text-[11px] sm:text-[10px] uppercase tracking-widest whitespace-nowrap hover:bg-gray-50 transition-all">
                <Download size={14} /> PDF
              </button>
            </div>
            {version.type === "DRAFT" && (
              <button
                onClick={() => onLaunch(p)}
                className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded font-bold text-[11px] sm:text-[10px] uppercase tracking-widest transition-all ${isUpdate
                    ? "bg-[#4DB01E] text-white hover:brightness-110"
                    : "bg-[#B19CD9] text-black shadow-lg shadow-[#B19CD9]/20 hover:brightness-105"
                  }`}
              >
                <Zap size={14} /> {isUpdate ? "Sync Updates to Live" : "Launch Product"}
              </button>
            )}
            <button onClick={() => onDelete(p)} className="w-full flex items-center justify-center gap-2 px-6 py-3 border-2 border-red-200 text-red-500 rounded font-bold text-[11px] sm:text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all">
              <Trash2 size={14} /> Delete Version
            </button>
          </div>
        </div>
      </div>

      {/* Documentation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* — IMAGE STUDIO — */}
        <div className="lg:col-span-4 space-y-4">
          <div className={`aspect-[3/4] w-72 sm:w-80 lg:w-full mx-auto lg:mx-0 border ${activeImage ? "border-gray-200" : "border-gray-400"} bg-gray-50/50 rounded-sm overflow-hidden flex items-center justify-center`}>
            {activeImage ? (
              <img src={activeImage} className="w-full h-full object-cover" alt={p.title} />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-200">
                <ImageIcon size={32} />
                <span className="text-[11px] sm:text-[9px] font-bold uppercase tracking-widest">No Image</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1 justify-center order-2">
              {["Global", ...variants.map(v => v.color_name)].map(tab => {
                const variant = variants.find(v => v.color_name === tab);
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveImageTab(tab);
                      const tabImages = tab === "Global" ? images.filter(img => !img.variant_id) : images.filter(img => img.variant_id === variant?.id);
                      setActiveImage(tabImages[0]?.image_url ?? null);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] sm:text-[9px] font-bold uppercase tracking-wider rounded border transition-all ${activeImageTab === tab ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}
                  >
                    {variant && <div className="w-2 h-2 rounded-full border border-white/20" style={{ backgroundColor: variant.color_hex }} />}
                    {tab}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 justify-center order-1">
              {(activeImageTab === "Global" ? images.filter(img => !img.variant_id) : images.filter(img => img.variant_id === variants.find(v => v.color_name === activeImageTab)?.id)).map((img, i) => (
                <button key={i} onClick={() => setActiveImage(img.image_url)} className={`w-16 h-20 sm:w-12 sm:h-16 border bg-gray-50 shrink-0 overflow-hidden transition-all ${activeImage === img.image_url ? "border-gray-900" : "border-gray-200 opacity-50 hover:opacity-80"}`}>
                  <img src={img.image_url} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* — SPECS & MATRIX — */}
        <div className="lg:col-span-8 space-y-12">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-gray-600" />
              <h3 className="text-[12px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Technical Specifications</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-8 gap-x-4">
              {[
                { label: "Category", value: p.category },
                { label: "Gender", value: p.gender || "N/A" },
                { label: "Sizes", value: p.sizes?.length ? p.sizes.join(", ") : "N/A" },
                { label: "Fabrication", value: p.fabric || "N/A" },
                { label: "Silhouette", value: p.fit || "N/A" },
                { label: "Occasion", value: p.occasion || "N/A" },
                { label: "Maintenance", value: p.care_instructions || "N/A" }
              ].map((item, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[10px] sm:text-[8px] font-bold text-gray-600 uppercase tracking-widest">{item.label}</p>
                  <p className="text-[13px] sm:text-[11px] font-bold text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Boxes size={14} className="text-gray-600" />
              <h3 className="text-[12px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Inventory Distribution Matrix</h3>
            </div>
            <div className="border border-gray-400 rounded-sm overflow-hidden">
              <table className="w-full text-center text-[13px] sm:text-[11px]">
                <thead className="bg-gray-50 border-b border-gray-400">
                  <tr className="divide-x divide-gray-300">
                    <th className="px-6 py-3 font-bold text-gray-600 uppercase tracking-wider">Variant</th>
                    <th className="px-6 py-3 font-bold text-gray-600 uppercase tracking-wider">SKU</th>
                    <th className="px-6 py-3 font-bold text-gray-600 uppercase tracking-wider">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {variants.map((v, i) => (
                    <tr key={i} className="divide-x divide-gray-300 hover:bg-gray-50/30">
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full border border-gray-200" style={{ backgroundColor: v.color_hex }} />
                          <span className="font-bold">{v.color_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 font-mono text-[12px] sm:text-[10px] text-gray-600">{v.variant_sku}</td>
                      <td className="px-6 py-3 font-bold text-gray-900">
                        {v.is_unlimited ? "Unlimited" : v.stock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-gray-600" />
              <h3 className="text-[12px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Merchandising & Taxonomy</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-8 gap-x-4">
              <div className="space-y-2">
                <p className="text-[10px] sm:text-[8px] font-bold text-gray-600 uppercase tracking-widest">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.tags?.length ? p.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[9px] font-bold uppercase tracking-widest bg-gray-100 text-gray-600 border-none">{tag}</Badge>
                  )) : <span className="text-[13px] sm:text-[11px] font-bold text-gray-900">None</span>}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] sm:text-[8px] font-bold text-gray-600 uppercase tracking-widest">Badges</p>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const systemBadges = [
                      p.is_new_arrival && "New Arrival",
                      p.is_featured && "Featured",
                      p.is_bestseller && "Bestseller",
                      p.is_trending && "Trending",
                    ].filter(Boolean) as string[];
                    const customBadges = (p.badges ?? []).filter(b => b !== "Updates yet to be synced");
                    const allBadges = [...systemBadges, ...customBadges];
                    return allBadges.length
                      ? allBadges.map(badge => (
                          <Badge key={badge} variant="secondary" className="text-[9px] font-bold uppercase tracking-widest bg-gray-900 text-white border-none">{badge}</Badge>
                        ))
                      : <span className="text-[11px] font-bold text-gray-900">None</span>;
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-gray-600" />
              <h3 className="text-[12px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Catalogue Highlights</h3>
            </div>
            <div className="space-y-3">
              {!isPlaceholderDescription(p.description_points) ? p.description_points?.map((pt, i) => (
                <div key={i} className="flex gap-3 text-[13px] sm:text-[11px] leading-relaxed text-gray-500 font-medium">
                  <span className="text-gray-900 font-bold shrink-0">0{i + 1}.</span>
                  <p className="text-justify">{pt}</p>
                </div>
              )) : <p className="text-[13px] sm:text-[11px] text-gray-600 font-medium">[No product details specified]</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface GroupedProduct {
  base_sku: string;
  title: string;
  price: number;
  created_at: string;
  updated_at: string;
  image_url: string | null;
  has_pending_updates: boolean;
  is_published: boolean;
  has_draft: boolean;
  // Hydrated after on-demand detail fetch
  published?: ProductItem;
  draft?: ProductItem;
  detailLoaded?: boolean;
  // legacy compat
  id?: string;
  lastModified?: number;
}

type CatalogDetailData = { published?: ProductItem; draft?: ProductItem };

interface CatalogListRow {
  base_sku: string;
  title: string;
  price: number;
  created_at: string;
  updated_at: string;
  primary_image_url?: string | null;
  has_pending_updates?: boolean;
  is_published?: boolean;
  has_draft?: boolean;
}

interface CatalogListResponse { products?: CatalogListRow[]; hasMore?: boolean; }

// ─── Module-level in-memory caches (survive re-renders and remounts) ─────────
import {
  LIST_TTL_MS, DETAIL_TTL_MS,
  listCache, detailCache, listInFlight, detailInFlight,
  listCacheKey, isExpired, invalidateAfterMutation,
} from "@/lib/catalogCache";

/** Dev-only — set VITE_DEBUG_CACHE=true to enable in production builds */
const DEBUG_CACHE = import.meta.env.DEV || import.meta.env.VITE_DEBUG_CACHE === "true";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clog(...args: any[]): void { if (DEBUG_CACHE) console.log(...args); }

function traceFlow(type: "LIST" | "DETAIL", steps: string[]): void {
  if (!DEBUG_CACHE) return;
  console.log(`[TRACE] ${type} FLOW:\n${steps.map(s => `  ${s}`).join("\n")}`);
}

function mapDetailResponse(data: CatalogDetailData): { published?: ProductItem; draft?: ProductItem } {
  const published: ProductItem | undefined = data.published
    ? {
        ...data.published,
        status: "PUBLISHED" as const,
        image_url: data.published.product_images?.find((i: ProductImage) => !i.variant_id)?.image_url
          ?? data.published.product_images?.[0]?.image_url,
      }
    : undefined;
  const draft: ProductItem | undefined = data.draft
    ? {
        ...data.draft,
        status: "DRAFT" as const,
        image_url: data.draft.draft_product_images?.find((i: ProductImage) => !i.variant_id)?.image_url
          ?? data.draft.draft_product_images?.[0]?.image_url,
      }
    : undefined;
  return { published, draft };
}

function prefetchDetailForSku(sku: string): void {
  if (detailInFlight.has(sku)) return;
  const entry = detailCache.get(sku);
  if (entry && !isExpired(entry.timestamp, DETAIL_TTL_MS)) return;

  clog(`[CACHE] DETAIL → PREFETCH sku=${sku}`);
  const p = authHeader()
    .then(headers => fetch(`${getBackendBaseUrl()}/api/products/catalog-detail?sku=${encodeURIComponent(sku)}`, { headers }))
    .then(res => { if (!res.ok) throw new Error("prefetch failed"); return res.json(); })
    .then(data => mapDetailResponse(data));

  detailInFlight.set(sku, p);
  p.then(detail => {
    detailCache.set(sku, { data: detail, timestamp: Date.now() });
    clog(`[CACHE] DETAIL → PREFETCH STORED sku=${sku}`);
  }).catch(() => {}).finally(() => detailInFlight.delete(sku));
}

function prefetchList(status: "ALL" | "PUBLISHED" | "DRAFT", showAll: boolean): void {
  const key = listCacheKey(status, showAll);
  if (listInFlight.has(key)) return;
  const entry = listCache.get(key);
  if (entry && !isExpired(entry.timestamp, LIST_TTL_MS)) return;

  clog(`[CACHE] LIST → PREFETCH key=${key}`);
  const params = new URLSearchParams({ status });
  if (!showAll) params.append("limit", "10");
  const p = authHeader()
    .then(headers => fetch(`${getBackendBaseUrl()}/api/products/catalog-list?${params}`, { headers }))
    .then(res => { if (!res.ok) throw new Error("prefetch failed"); return res.json(); });

  listInFlight.set(key, p);
  p.then(data => {
    listCache.set(key, { data, timestamp: Date.now() });
    clog(`[CACHE] LIST → PREFETCH STORED key=${key}`);
  }).catch(() => {}).finally(() => listInFlight.delete(key));
}

// ─────────────────────────────────────────────────────────────────────────────

const FILTER_SEGMENTS = ["ALL", "PUBLISHED", "DRAFT"] as const;

const ManageProducts = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<GroupedProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<GroupedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "DRAFT" | "PUBLISHED">("ALL");
  const [isMobileDetailView, setIsMobileDetailView] = useState(false);
  // Which stacked version (published vs draft) is currently dominating the viewport —
  // drives the single Live/Sync badge in the mobile back bar when a product has both.
  const [activeVersion, setActiveVersion] = useState<"PUBLISHED" | "DRAFT">("PUBLISHED");
  const versionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showAllMap, setShowAllMap] = useState<{
    ALL: boolean;
    PUBLISHED: boolean;
    DRAFT: boolean;
  }>({
    ALL: false,
    PUBLISHED: false,
    DRAFT: false
  });

  const [, setHasMoreMap] = useState<{
    ALL: boolean;
    PUBLISHED: boolean;
    DRAFT: boolean;
  }>({
    ALL: false,
    PUBLISHED: false,
    DRAFT: false
  });

  // Width of the filter segmented-control track — drives the draggable pill geometry.
  const filterTrackRef = useRef<HTMLDivElement>(null);
  const [filterTrackW, setFilterTrackW] = useState(0);
  useEffect(() => {
    const measure = () => setFilterTrackW(filterTrackRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Scroll-spy: when both a published and a draft version are stacked, track which
  // one occupies more of the viewport so the back-bar badge can switch Live ↔ Sync.
  useEffect(() => {
    setActiveVersion("PUBLISHED"); // reset to the top (live) version on product change
    const els = ["PUBLISHED", "DRAFT"]
      .map((t) => versionRefs.current[t])
      .filter((el): el is HTMLDivElement => Boolean(el));
    if (els.length < 2) return; // single version — badge logic falls back to that one

    const ratios = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) ratios.set(e.target, e.intersectionRatio);
          else ratios.delete(e.target);
        }
        let bestEl: Element | null = null;
        let bestRatio = -1;
        for (const [el, ratio] of ratios) {
          if (ratio > bestRatio) { bestRatio = ratio; bestEl = el; }
        }
        const v = bestEl?.getAttribute("data-version");
        if (v === "PUBLISHED" || v === "DRAFT") setActiveVersion(v);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // Re-run when the product or its version composition changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct?.base_sku, selectedProduct?.detailLoaded, selectedProduct?.is_published, selectedProduct?.has_pending_updates]);

  const applyDetail = (sku: string, detail: { published?: ProductItem; draft?: ProductItem }) => {
    setProducts(prev => prev.map(p =>
      p.base_sku === sku ? { ...p, ...detail, detailLoaded: true } : p
    ));
    setSelectedProduct(prev =>
      prev?.base_sku === sku ? { ...prev, ...detail, detailLoaded: true } : prev
    );
  };

  const fetchDetailForGroup = async (group: GroupedProduct) => {
    const sku = group.base_sku;

    // ① Module-level cache hit (with TTL check)
    const entry = detailCache.get(sku);
    if (entry && !isExpired(entry.timestamp, DETAIL_TTL_MS)) {
      const age = Math.round((Date.now() - entry.timestamp) / 1000);
      clog(`[CACHE] DETAIL → HIT (memory) sku=${sku} age=${age}s`);
      applyDetail(sku, entry.data as CatalogDetailData);
      traceFlow("DETAIL", ["Frontend Cache → HIT", "No API call"]);
      return;
    }
    if (entry) clog(`[CACHE] DETAIL → EXPIRED sku=${sku}`);

    // ② In-flight dedup — await the existing promise instead of starting a new fetch
    const existing = detailInFlight.get(sku);
    if (existing) {
      clog(`[CACHE] DETAIL → USING IN-FLIGHT REQUEST sku=${sku}`);
      const waitT0 = performance.now();
      try {
        const detail = await existing;
        const waited = Math.round(performance.now() - waitT0);
        clog(`[CACHE] DETAIL → IN-FLIGHT RESOLVED sku=${sku} waited=${waited}ms`);
        applyDetail(sku, detail as CatalogDetailData);
        traceFlow("DETAIL", [
          "Frontend Cache → MISS",
          `In-Flight Dedup → JOINED (waited ${waited}ms)`,
          "No duplicate API call",
        ]);
      } catch {
        // error already surfaced by the original in-flight caller
      }
      return;
    }

    // ③ Fresh fetch — pure data promise stored in detailInFlight for dedup
    clog(`[CACHE] DETAIL → MISS sku=${sku}`);

    let fetchElapsed = 0;
    let detailApiSource = "DB"; // overwritten from X-Cache response header
    const fetchPromise = (async (): Promise<{ published?: ProductItem; draft?: ProductItem }> => {
      const base = getBackendBaseUrl();
      clog(`[FRONTEND] FETCH DETAIL → sku=${sku}`);
      const t0 = performance.now();
      const res = await fetch(`${base}/api/products/catalog-detail?sku=${encodeURIComponent(sku)}`, {
        headers: { ...(await authHeader()) },
      });
      detailApiSource = res.headers.get("X-Cache") === "HIT" ? "Redis" : "DB";
      if (!res.ok) throw new Error("Failed to fetch product detail");
      const data = await res.json();
      fetchElapsed = Math.round(performance.now() - t0);
      clog(`[FRONTEND] RESPONSE DETAIL → ${fetchElapsed}ms sku=${sku} [${detailApiSource}]`);
      return mapDetailResponse(data);
    })();

    detailInFlight.set(sku, fetchPromise);

    try {
      const detail = await fetchPromise;
      detailCache.set(sku, { data: detail, timestamp: Date.now() });
      clog(`[CACHE] DETAIL → STORED sku=${sku} (TTL 2min)`);
      applyDetail(sku, detail);
      traceFlow("DETAIL", [
        "Frontend Cache → MISS",
        `API → FETCHED (${fetchElapsed}ms) [${detailApiSource}]`,
        "Response cached (TTL 2min)",
      ]);
    } catch (err) {
      console.error("Error fetching product detail:", err);
      toast.error("Failed to load product detail");
    } finally {
      detailInFlight.delete(sku);
    }
  };

  const fetchProducts = async (
    status: "ALL" | "PUBLISHED" | "DRAFT",
    showAll: boolean
  ) => {
    setLoading(true);
    const key = listCacheKey(status, showAll);
    const traceSteps: string[] = [];

    try {
      let data: CatalogListResponse;

      // ① Module-level list cache hit
      const listEntry = listCache.get(key);
      if (listEntry && !isExpired(listEntry.timestamp, LIST_TTL_MS)) {
        const age = Math.round((Date.now() - listEntry.timestamp) / 1000);
        clog(`[CACHE] LIST → HIT (memory) key=${key} age=${age}s`);
        data = listEntry.data as CatalogListResponse;
        traceSteps.push("Frontend Cache → HIT", "No API call");
      } else {
        if (listEntry) clog(`[CACHE] LIST → EXPIRED key=${key}`);

        // ② In-flight dedup — join an existing request for the same key
        const existing = listInFlight.get(key);
        if (existing) {
          clog(`[CACHE] LIST → USING IN-FLIGHT REQUEST key=${key}`);
          const waitT0 = performance.now();
          data = (await existing) as CatalogListResponse;
          const waited = Math.round(performance.now() - waitT0);
          clog(`[CACHE] LIST → IN-FLIGHT RESOLVED key=${key} waited=${waited}ms`);
          traceSteps.push(
            "Frontend Cache → MISS",
            `In-Flight Dedup → JOINED (waited ${waited}ms)`,
            "No duplicate API call",
          );
        } else {
          // ③ Fresh fetch
          clog(`[CACHE] LIST → MISS key=${key}`);
          const base = getBackendBaseUrl();
          const params = new URLSearchParams();
          params.append("status", status);
          if (!showAll) params.append("limit", "10");

          clog(`[FRONTEND] FETCH LIST → status=${status} limit=${showAll ? "ALL" : "10"}`);
          const fetchT0 = performance.now();

          let listApiSource = "DB"; // overwritten from X-Cache response header
          const fetchPromise = authHeader()
            .then(headers => fetch(`${base}/api/products/catalog-list?${params.toString()}`, { headers }))
            .then(res => {
              listApiSource = res.headers.get("X-Cache") === "HIT" ? "Redis" : "DB";
              if (!res.ok) throw new Error("Failed to fetch products");
              return res.json();
            });

          listInFlight.set(key, fetchPromise);
          try {
            data = await fetchPromise;
            const elapsed = Math.round(performance.now() - fetchT0);
            clog(`[FRONTEND] RESPONSE LIST → ${elapsed}ms key=${key} rows=${data.products?.length ?? 0} [${listApiSource}]`);
            listCache.set(key, { data, timestamp: Date.now() });
            clog(`[CACHE] LIST → STORED key=${key} (TTL 600s)`);
            traceSteps.push(
              "Frontend Cache → MISS",
              `API → FETCHED (${elapsed}ms) [${listApiSource}]`,
              "Response cached (TTL 60s)",
            );
          } finally {
            listInFlight.delete(key);
          }
        }
      }

      // Hydrate thin rows from module-level detail cache (TTL-checked)
      const rows: GroupedProduct[] = (data.products ?? []).map((p: CatalogListRow) => {
        const dEntry = detailCache.get(p.base_sku);
        const cached = dEntry && !isExpired(dEntry.timestamp, DETAIL_TTL_MS) ? (dEntry.data as CatalogDetailData) : null;
        return {
          base_sku:            p.base_sku,
          title:               p.title,
          price:               p.price,
          created_at:          p.created_at,
          updated_at:          p.updated_at,
          image_url:           p.primary_image_url ?? null,
          has_pending_updates: !!p.has_pending_updates,
          is_published:        !!p.is_published,
          has_draft:           !!p.has_draft,
          id:                  p.base_sku,
          ...(cached ? { ...cached, detailLoaded: true } : {}),
        };
      });

      setProducts(rows);
      clog(`[LIST] ${rows.length} cards rendered with text — image pixels loading lazily via browser`);
      setHasMoreMap(prev => ({ ...prev, [status]: !!data.hasMore }));

      if (rows.length > 0) {
        const selectionExists = rows.some(p => p.base_sku === selectedProduct?.base_sku);
        const target = (!selectedProduct || !selectionExists)
          ? rows[0]
          : rows.find(p => p.base_sku === selectedProduct.base_sku)!;
        setSelectedProduct(target);
        if (!target.detailLoaded) {
          void fetchDetailForGroup(target);
        }
      } else {
        setSelectedProduct(null);
      }
      traceFlow("LIST", traceSteps);
    } catch (err) {
      console.error("Error fetching products:", err);
      toast.error("Failed to load catalog");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(filterStatus, showAllMap[filterStatus]);
    // Re-fetch only when the active filter or its show-all flag changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, showAllMap[filterStatus]]);

  const handleProductSelect = (product: GroupedProduct) => {
    setSelectedProduct(product);
    setIsMobileDetailView(true);
    if (!product.detailLoaded) {
      void fetchDetailForGroup(product);
    }
  };

  const handleEditProduct = (product: ProductItem) => {
    navigate(`/admin/edit/${product.id}`);
  };

  const handleLaunchProduct = async (product: ProductItem) => {
    if (!window.confirm(`Are you sure you want to launch "${product.title}"?\n\nThis will move the product from Drafts to the Live Catalog and it will become visible to customers.`)) return;

    try {
      const base = getBackendBaseUrl();
      const images = product.status === "DRAFT" ? product.draft_product_images : product.product_images;
      const variants = product.status === "DRAFT" ? product.draft_product_variants : product.product_variants;

      const payload = {
        status: "PUBLISHED",
        ...buildPayloadFromProduct(product, images || [], variants || []),
      };

      console.log(`[ManageProducts] POST /api/products/preview (launch)  sku=${product.base_sku}`);
      const res = await fetch(`${base}/api/products/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify(payload),
      });
      console.log(`[ManageProducts] launch → ${res.status}${res.status === 401 || res.status === 403 ? " (admin auth failed)" : ""}`);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.database?.error || "Failed to launch product");
      }

      toast.success(`"${product.title}" has been successfully launched!`);

      // Optimistic update — reflect launched state immediately, no re-fetch or spinner
      const optimisticPublished: ProductItem = { ...product, status: "PUBLISHED" as const };
      const applyLaunch = (p: GroupedProduct): GroupedProduct =>
        p.base_sku === product.base_sku
          ? { ...p, is_published: true, has_draft: false, has_pending_updates: false,
              published: optimisticPublished, draft: undefined, detailLoaded: true }
          : p;
      setProducts(prev => {
        const mapped = prev.map(applyLaunch);
        const idx = mapped.findIndex(p => p.base_sku === product.base_sku);
        if (idx <= 0) return mapped;
        return [mapped[idx], ...mapped.slice(0, idx), ...mapped.slice(idx + 1)];
      });
      setSelectedProduct(prev => prev ? applyLaunch(prev) : prev);

      // Bust caches — product status changed, stale data must not be served
      clog(`[CACHE] INVALIDATE → launch sku=${product.base_sku} (frontend: list cleared + detail evicted)`);
      invalidateAfterMutation(product.base_sku);

      // Silent background refresh — backend created a new published row with a new ID;
      // applyDetail will overwrite the optimistic object with the canonical one once resolved
      void fetchDetailForGroup({ base_sku: product.base_sku } as GroupedProduct);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteProduct = async (product: ProductItem) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${product.title}"?\n\nThis will remove the product, all its variants, and images from the database. This action cannot be undone.`)) return;

    try {
      const base = getBackendBaseUrl();
      console.log(`[ManageProducts] DELETE /api/products/${product.id}  status=${product.status}  sku=${product.base_sku}`);
      const res = await fetch(
        `${base}/api/products/${product.id}?status=${product.status}&base_sku=${encodeURIComponent(product.base_sku)}`,
        { method: "DELETE", headers: { ...(await authHeader()) } }
      );
      console.log(`[ManageProducts] delete → ${res.status}${res.status === 401 || res.status === 403 ? " (admin auth failed)" : ""}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete product");
      }

      toast.success("Product permanently deleted");

      const isDeletedSelected = selectedProduct?.base_sku === product.base_sku;

      // Compute next list as a pure value from the current snapshot — no
      // side-effects inside the updater, safe under React StrictMode double-invoke.
      const nextList: GroupedProduct[] = [];
      let survivingGroup: GroupedProduct | null = null;
      const deletedIndex = products.findIndex(p => p.base_sku === product.base_sku);

      for (const p of products) {
        if (p.base_sku === product.base_sku) {
          const reconciled: GroupedProduct = { ...p };

          if (product.status === "PUBLISHED") {
            reconciled.published           = undefined;
            reconciled.is_published        = false;
            reconciled.has_pending_updates = false;
          } else if (product.status === "DRAFT") {
            reconciled.draft               = undefined;
            reconciled.has_draft           = false;
            reconciled.has_pending_updates = false;
          }

          // If both versions are gone, drop the group entirely
          if (!reconciled.is_published && !reconciled.has_draft) continue;

          clog(`[CACHE] INVALIDATE → delete sku=${p.base_sku} status=${product.status} (frontend: list cleared + detail evicted)`);
          invalidateAfterMutation(p.base_sku);
          reconciled.detailLoaded = false;

          if (product.status === "PUBLISHED" && reconciled.draft) {
            reconciled.image_url = reconciled.draft.image_url ?? p.image_url;
            reconciled.title     = reconciled.draft.title     ?? p.title;
            reconciled.price     = reconciled.draft.price     ?? p.price;
          }

          nextList.push(reconciled);
          if (isDeletedSelected) survivingGroup = reconciled;
        } else {
          nextList.push(p);
        }
      }

      // If the group was fully removed, fall back to the nearest neighbor
      const newSelection: GroupedProduct | null = survivingGroup
        ?? (isDeletedSelected ? (nextList[deletedIndex] ?? nextList[deletedIndex - 1] ?? null) : null);

      setProducts(nextList);

      if (isDeletedSelected) {
        setSelectedProduct(newSelection);
        if (newSelection) {
          void fetchDetailForGroup(newSelection);
        } else {
          setIsMobileDetailView(false);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownloadPdf = (product: ProductItem) => {
    const allImages: ProductImage[] = (product.status === "PUBLISHED"
      ? product.product_images
      : product.draft_product_images) ?? [];
    const variants: ProductVariant[] = (product.status === "PUBLISHED"
      ? product.product_variants
      : product.draft_product_variants) ?? [];
    const totalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    const isUnlimited = variants.some(v => v.is_unlimited);

    // Build grouped image sections
    const globalImages = allImages.filter(img => !img.variant_id);
    const imageSections = [
      { label: "Global Gallery", images: globalImages, hex: null },
      ...variants.map(v => ({
        label: `${v.color_name} Variant`,
        images: allImages.filter(img => img.variant_id === v.id),
        hex: v.color_hex
      }))
    ].filter(s => s.images.length > 0);

    const imageGroupsHtml = imageSections.map(section => `
      <div style="margin-bottom:32px;">
        <div class="section-title" style="display:flex;align-items:center;gap:8px;">
          ${section.hex ? `<span style="width:10px;height:10px;border-radius:50%;background:${section.hex};display:inline-block;border:1px solid rgba(0,0,0,0.1);flex-shrink:0;"></span>` : ''}
          ${section.label}
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
          ${section.images.map(img => `
            <div style="aspect-ratio:3/4;overflow:hidden;border:1px solid #eee;border-radius:4px;">
              <img src="${img.image_url}" style="width:100%;height:100%;object-fit:cover;" alt="${img.alt_text ?? section.label}" />
            </div>
          `).join("")}
        </div>
      </div>`).join("");

    const variantRows = variants.map(v => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span style="width:10px;height:10px;border-radius:50%;background:${v.color_hex};display:inline-block;border:1px solid rgba(0,0,0,0.1);"></span>
            ${v.color_name}
          </span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:11px;color:#888;">${v.variant_sku}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:bold;">${v.is_unlimited ? 'Unlimited' : v.stock}</td>
      </tr>`).join("");

    const highlights = isPlaceholderDescription(product.description_points)
      ? `<p style="color:#999;font-size:12px;">No product details specified.</p>`
      : (product.description_points ?? []).map((pt, i) => `
        <div style="display:flex;gap:10px;margin-bottom:8px;">
          <span style="font-weight:bold;color:#111;min-width:24px;">0${i + 1}.</span>
          <span style="color:#555;font-size:12px;line-height:1.6;">${pt}</span>
        </div>`).join("");

    const formattedDateTime = new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Sheet — ${product.title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
        <style>
          @page {
            size: auto;
            margin: 0;
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #111;
            padding: 1.5cm 2cm;
            font-size: 13px;
            line-height: 1.6;
          }
          h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; }
          .label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 3px; }
          .value { font-size: 12px; font-weight: 700; color: #111; }
          .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 16px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 32px; margin-bottom: 32px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #f8f8f8; padding: 8px 12px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; }
          .status-badge {
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1px;
            text-transform: uppercase;
            display: inline-block;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .footer { margin-top: 40px; border-top: 1px solid #eee; padding-top: 12px; color: #bbb; font-size: 10px; display: flex; justify-content: space-between; }
          @media print {
            body { padding: 1.5cm 2cm; }
            img { break-inside: avoid; }
            th {
              background: #f8f8f8 !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <!-- Row 1: Left-aligned Logo & Title -->
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">
          <img src="${logo}" style="height:48px;width:auto;print-color-adjust:exact;-webkit-print-color-adjust:exact;" alt="The Lil Edit Logo" />
          <span style="font-size:24px;font-weight:600;color:#111;font-family:'Playfair Display', Georgia, serif;letter-spacing:-0.2px;">The Lil Edit</span>
        </div>

        <!-- Row 2: Product Sheet Details & Status -->
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:28px;">
          <!-- Left: Title & Subtitle -->
          <div style="text-align:left;">
            <p style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#999;margin-bottom:4px;">Product Data Sheet</p>
            <h1 style="margin:0;">${product.title}</h1>
          </div>
          
          <!-- Right: Status -->
          <div style="text-align:right;">
            <div class="label" style="margin-bottom:6px;">Status</div>
            <span class="status-badge" style="background:${product.status === 'PUBLISHED' ? '#111' : '#e0e0e0'};color:${product.status === 'PUBLISHED' ? '#fff' : '#555'};">${product.status}</span>
          </div>
        </div>

        <div class="grid">
          <div><div class="label">Master SKU</div><div class="value" style="font-family:monospace;">${product.base_sku}</div></div>
          <div><div class="label">Brand</div><div class="value">${product.brand}</div></div>
          <div><div class="label">Selling Price (INR)</div><div class="value">₹${product.price.toLocaleString()}</div></div>
          <div><div class="label">MRP / Original Price</div><div class="value">${product.original_price ? `₹${product.original_price.toLocaleString()}` : '—'}</div></div>
          <div><div class="label">Category</div><div class="value">${product.category}</div></div>
          <div><div class="label">Gender</div><div class="value">${product.gender ?? 'N/A'}</div></div>
          <div><div class="label">Total Stock</div><div class="value">${isUnlimited ? 'Unlimited' : `${totalStock} units`}</div></div>
          <div><div class="label">Sizes</div><div class="value">${product.sizes?.length ? product.sizes.join(', ') : 'N/A'}</div></div>
          <div><div class="label">Fabrication</div><div class="value">${product.fabric ?? 'N/A'}</div></div>
          <div><div class="label">Silhouette</div><div class="value">${product.fit ?? 'N/A'}</div></div>
          <div><div class="label">Occasion</div><div class="value">${product.occasion ?? 'N/A'}</div></div>
          <div><div class="label">Maintenance</div><div class="value">${product.care_instructions ?? 'N/A'}</div></div>
        </div>

        <div class="grid">
          <div><div class="label">Tags</div><div class="value">${product.tags?.length ? product.tags.join(', ') : 'None'}</div></div>
          <div><div class="label">Badges</div><div class="value">${product.badges?.length ? product.badges.join(', ') : 'None'}</div></div>
          <div>
            <div class="label">Merchandising Flags</div>
            <div class="value">
              ${[
        product.is_featured ? 'Featured' : '',
        product.is_new_arrival ? 'New Arrival' : '',
        product.is_bestseller ? 'Bestseller' : '',
        product.is_trending ? 'Trending' : ''
      ].filter(Boolean).join(', ') || 'None'}
            </div>
          </div>
          <div><div class="label">Occasion</div><div class="value">${product.occasion ?? 'N/A'}</div></div>
          <div><div class="label">Maintenance</div><div class="value">${product.care_instructions ?? 'N/A'}</div></div>
        </div>

        ${variants.length > 0 ? `
        <div class="section-title">Inventory Distribution Matrix</div>
        <table style="margin-bottom:32px;">
          <thead><tr><th>Variant</th><th>SKU</th><th style="text-align:right;">Units</th></tr></thead>
          <tbody>${variantRows}</tbody>
          <tfoot><tr><td colspan="2" style="padding:8px 12px;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;border-top:1px solid #eee;">Consolidated Total</td><td style="padding:8px 12px;text-align:right;font-weight:800;border-top:1px solid #eee;">${isUnlimited ? 'Unlimited' : totalStock}</td></tr></tfoot>
        </table>` : ''}

        ${imageGroupsHtml ? `
        <div class="section-title">Product Image Assets</div>
        ${imageGroupsHtml}` : ''}

        ${highlights ? `
        <div class="section-title">Catalogue Highlights</div>
        <div>${highlights}</div>` : ''}

        <div class="footer">
          <span>The Lil Edit — Inventory Management</span>
          <span>Generated: ${formattedDateTime}</span>
        </div>
      </body>
      </html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  const filteredProducts = useMemo(() =>
    products.filter(p =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.base_sku.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [products, searchTerm]
  );

  // Draggable filter pill geometry (track has p-1 = 4px inset on each side).
  const FILTER_PAD = 4;
  const filterSegW = filterTrackW > 0 ? (filterTrackW - FILTER_PAD * 2) / 3 : 0;
  const filterActiveIndex = FILTER_SEGMENTS.indexOf(filterStatus);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] selection:bg-black/5 flex flex-col font-sans">
      {user ? <UserNavbar /> : <Navbar />}

      {/* PAGE HEADER */}
      <div className={`relative md:pt-[128px] bg-white border-foreground/50 ${isMobileDetailView ? "pt-[120px] pb-0 border-b-0 md:pb-8 md:border-b" : "pt-[160px] pb-8 border-b"}`}>
        {/* Admin dropdown — hidden on the mobile product detail view */}
        <div className={isMobileDetailView ? "hidden md:block" : ""}>
          <AdminSubNav />
        </div>
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className={`space-y-1 ${isMobileDetailView ? "hidden md:block" : ""}`}>
            <div className="flex items-center min-h-[36px] sm:min-h-[46px]">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: "#B19CD9" }}>Catalog Studio</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 pt-[10px] md:pt-0">Inventory Management</h1>
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col md:flex-row relative min-h-[calc(100vh-250px)]">

        {/* LEFT COLUMN — Product List (25%) */}
        <aside className={`w-full md:w-[25%] border-r border-foreground/50 bg-white flex flex-col shrink-0 md:sticky md:top-[128px] transition-transform duration-300 md:translate-x-0 ${isMobileDetailView ? "-translate-x-full md:translate-x-0 hidden md:flex" : "translate-x-0 flex"}`}>
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-gray-400 rounded-md bg-gray-50/50 outline-none focus:border-gray-900 transition-all font-medium"
                />
              </div>
              <Link
                to="/admin/add-product"
                className="p-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-all shrink-0"
                title="Create New Entry"
              >
                <Plus size={16} />
              </Link>
            </div>
            <div ref={filterTrackRef} className="relative flex bg-gray-50 p-1 rounded-md border border-gray-200 select-none">
              {/* Segments — click to select; labels sit above the pill (z-30) and don't block its drag (pointer-events-none) */}
              {FILTER_SEGMENTS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilterStatus(status)}
                  onMouseEnter={() => prefetchList(status, showAllMap[status])}
                  aria-pressed={filterStatus === status}
                  className="group flex-1 flex items-center justify-center py-2 sm:py-1.5"
                >
                  <span
                    className={`relative z-30 pointer-events-none text-[11px] sm:text-[9px] font-bold uppercase tracking-wider transition-colors ${filterStatus === status ? "text-gray-900" : "text-gray-600 group-hover:text-gray-600"}`}
                  >
                    {status}
                  </span>
                </button>
              ))}

              {/* Draggable sliding pill — sits over the active segment; release snaps to nearest */}
              {filterSegW > 0 && (
                <motion.div
                  drag="x"
                  dragConstraints={{ left: 0, right: filterSegW * 2 }}
                  dragElastic={0.04}
                  dragMomentum={false}
                  initial={false}
                  onDragEnd={(_, info) => {
                    const draggedX = filterActiveIndex * filterSegW + info.offset.x;
                    const idx = Math.max(0, Math.min(2, Math.round(draggedX / filterSegW)));
                    const next = FILTER_SEGMENTS[idx];
                    if (next !== filterStatus) setFilterStatus(next);
                    prefetchList(next, showAllMap[next]);
                  }}
                  animate={{ x: filterActiveIndex * filterSegW }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  style={{ width: filterSegW }}
                  className="absolute top-1 bottom-1 left-1 z-20 rounded bg-white shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing"
                />
              )}
            </div>
            {/* Elegant progressive load selector row */}
            <div className="flex justify-between items-center mt-3 text-[13px] sm:text-[11px] font-bold uppercase tracking-[0.1em] gap-4">
              <button
                onClick={() => setShowAllMap(prev => ({ ...prev, [filterStatus]: false }))}
                onMouseEnter={() => prefetchList(filterStatus, false)}
                className={`flex-1 py-2 sm:py-1.5 px-3 rounded transition-all text-center ${!showAllMap[filterStatus]
                    ? "bg-[#B19CD9] text-black font-black"
                    : "bg-gray-100 text-gray-600 hover:text-gray-600 border border-gray-300"
                  }`}
              >
                Top 10
              </button>
              <button
                onClick={() => setShowAllMap(prev => ({ ...prev, [filterStatus]: true }))}
                onMouseEnter={() => prefetchList(filterStatus, true)}
                className={`flex-1 py-2 sm:py-1.5 px-3 rounded transition-all text-center ${showAllMap[filterStatus]
                    ? "bg-[#B19CD9] text-black font-black"
                    : "bg-gray-100 text-gray-600 hover:text-gray-600 border border-gray-300"
                  }`}
              >
                See All
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar py-2">
            {loading ? (
              <div className="p-12 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">Loading Records...</div>
            ) : (
              <>
                {filteredProducts.map((p) => (
                  <button
                    key={p.base_sku}
                    onClick={() => handleProductSelect(p)}
                    onMouseEnter={() => prefetchDetailForSku(p.base_sku)}
                    className={`w-full text-left px-6 py-4 transition-all flex gap-4 border-b border-foreground/50 ${selectedProduct?.base_sku === p.base_sku ? "bg-gray-50 border-r-4 border-r-gray-900" : "hover:bg-gray-50/50"}`}
                  >
                    <div className="w-14 h-[68px] sm:w-12 sm:h-16 bg-gray-100 rounded border border-gray-200 flex-shrink-0 overflow-hidden relative">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" loading="lazy" onLoad={() => clog(`[IMG] pixels loaded  sku=${p.base_sku}`)} />
                      ) : (
                        <ImageIcon className="w-6 h-6 sm:w-5 sm:h-5 text-gray-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-sm sm:text-xs font-bold truncate leading-tight ${selectedProduct?.base_sku === p.base_sku ? "text-gray-900" : "text-gray-600"}`}>{p.title}</h3>
                          <span className="text-[11px] sm:text-[9px] text-gray-600 font-mono font-medium block mt-0.5">{p.base_sku}</span>
                        </div>
                        {p.is_published ? (
                          <span className="text-[10px] sm:text-[8px] font-black px-1.5 py-0.5 rounded bg-gray-900 text-white whitespace-nowrap uppercase">Published</span>
                        ) : (
                          <span className="text-[10px] sm:text-[8px] font-black px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 whitespace-nowrap uppercase">Draft</span>
                        )}
                      </div>
                      <div className="flex items-end justify-between mt-2">
                        <p className="text-xs sm:text-[10px] font-bold text-gray-900">₹{p.price.toLocaleString()}</p>
                        <div className="flex flex-col items-end gap-1">
                          {p.has_pending_updates && (
                            <span className="text-[10px] sm:text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap uppercase">Updates To be Synced</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN — Detail View (75%) */}
        <section className={`md:w-[75%] bg-white pb-32 transition-all duration-300 md:translate-x-0 ${isMobileDetailView ? "block translate-x-0" : "hidden md:block translate-x-full md:translate-x-0"}`}>

          {/* Mobile Back — pinned under the navbar while scrolling the detail */}
          <div className="md:hidden sticky top-[var(--navbar-height,114px)] z-30 p-6 bg-white flex items-center justify-between">
            <button onClick={() => setIsMobileDetailView(false)} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 transition-all">
              <ArrowLeft size={16} /> Back to Catalog
            </button>
            <div className="flex gap-2">
              {(() => {
                const hasLive = !!selectedProduct?.is_published;
                const draftRendered = !!selectedProduct?.has_draft && (!selectedProduct?.is_published || !!selectedProduct?.has_pending_updates);
                // With both stacked, follow the version in view; otherwise show whichever exists.
                const showLive = hasLive && (!draftRendered || activeVersion === "PUBLISHED");
                const showSync = draftRendered && (!hasLive || activeVersion === "DRAFT");
                return (
                  <>
                    {showLive && <Badge variant="outline" className="text-sm font-bold uppercase rounded-sm bg-amber-50 text-amber-600 border-amber-100">Live</Badge>}
                    {showSync && <Badge variant="outline" className="text-sm font-bold uppercase rounded-sm bg-amber-50 text-amber-600 border-amber-100">Sync</Badge>}
                  </>
                );
              })()}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {selectedProduct ? (
              <motion.div
                key={selectedProduct.base_sku}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-3 pt-3 pb-16 md:pt-2 lg:px-4 lg:pt-4 lg:pb-20"
              >
                {!selectedProduct.detailLoaded ? (
                  <div className="animate-pulse space-y-10 pt-6">
                    <div className="space-y-3">
                      <div className="h-7 bg-gray-100 rounded w-1/2" />
                      <div className="h-3 bg-gray-100 rounded w-1/3" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
                      <div className="md:col-span-4">
                        <div className="aspect-[3/4] bg-gray-100 rounded" />
                      </div>
                      <div className="md:col-span-8 space-y-6 pt-2">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${70 - i * 8}%` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {[
                      { type: "PUBLISHED" as const, data: selectedProduct.published, label: "Published Version" },
                      {
                        type: "DRAFT" as const,
                        data: selectedProduct.draft,
                        label: selectedProduct.has_pending_updates ? "Updates To be Synced" : "Draft Version",
                      },
                    ]
                      .filter((v): v is { type: "PUBLISHED" | "DRAFT"; data: ProductItem; label: string } =>
                        Boolean(v.data) && (v.type !== "DRAFT" || !selectedProduct.is_published || selectedProduct.has_pending_updates))
                      .map((version) => (
                        <div
                          key={version.type}
                          ref={(el) => { versionRefs.current[version.type] = el; }}
                          data-version={version.type}
                          className="border border-foreground/50 rounded-sm shadow-md p-5 md:p-8"
                        >
                          <ProductVersionView
                            version={version}
                            isUpdate={selectedProduct.is_published && selectedProduct.has_pending_updates}
                            onEdit={handleEditProduct}
                            onLaunch={handleLaunchProduct}
                            onDelete={handleDeleteProduct}
                            onDownloadPdf={handleDownloadPdf}
                          />
                        </div>
                      ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-20 text-center opacity-30">
                <Package size={32} />
                <p className="mt-4 text-[10px] font-bold uppercase tracking-widest">Select Record</p>
              </div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <div className="h-32 md:h-44 bg-white" />
      <Footer />
    </div>
  );
};

export default ManageProducts;
