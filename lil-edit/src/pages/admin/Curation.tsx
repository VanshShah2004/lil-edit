import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import {
  LayoutGrid,
  LayoutDashboard,
  ShoppingBag,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Search,
  X,
  ImagePlus,
  Save,
  Eye,
  ToggleRight,
  ToggleLeft,
  Check,
  Loader2,
  PackageX,
  Pencil,
  Monitor,
  Smartphone,
} from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { uploadProductImage } from "@/lib/uploadImage";
import QuickViewDrawer, { type QuickViewProduct } from "@/components/product/QuickViewDrawer";
import {
  fetchAdminSections,
  saveSectionItems,
  updateSection,
  searchProducts,
  previewSection,
  StaleSaveError,
  type AdminSection,
  type AdminSectionItem,
  type ResolvedItem,
  type ResolvedProductItem,
  type SectionItemInput,
  type SectionKey,
} from "@/lib/curationApi";

const ACCENT = "#B19CD9";
const TEAL = "#0F766E";

// Storefront pages, each grouping the sections that live on it. The sidebar shows
// these as expandable groups → click a page to reveal its sections.
const SECTION_GROUPS: { label: string; icon: typeof LayoutGrid; keys: SectionKey[] }[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    keys: ["home_trending", "home_recommended", "home_shop_the_look", "home_featured_categories", "home_collage"],
  },
  {
    label: "Collections Page",
    icon: ShoppingBag,
    keys: ["collections_featured"],
  },
  {
    label: "Search Bar",
    icon: Search,
    keys: ["search_popular", "search_discover"],
  },
];

function groupOf(key: SectionKey): string | null {
  return SECTION_GROUPS.find((g) => g.keys.includes(key))?.label ?? null;
}

// ─── Local working copy of an item (decoupled from the server shape) ──────────
interface DraftItem {
  tempId: string;
  kind: "product" | "editorial";
  productBaseSku: string | null;
  customTitle: string | null;
  customSubtitle: string | null;
  customImageUrl: string | null;
  linkUrl: string | null;
  badge: string | null;
  meta: Record<string, unknown>;
  isActive: boolean;
  product: ResolvedProductItem | null;
}

let tempCounter = 0;
const nextTempId = () => `tmp-${Date.now()}-${tempCounter++}`;

function toDraft(item: AdminSectionItem): DraftItem {
  return {
    tempId: item.id,
    kind: item.kind,
    productBaseSku: item.productBaseSku,
    customTitle: item.customTitle,
    customSubtitle: item.customSubtitle,
    customImageUrl: item.customImageUrl,
    linkUrl: item.linkUrl,
    badge: item.badge,
    meta: item.meta ?? {},
    isActive: item.isActive,
    product: item.product,
  };
}

function toInput(d: DraftItem): SectionItemInput {
  return {
    kind: d.kind,
    productBaseSku: d.productBaseSku,
    customTitle: d.customTitle,
    customSubtitle: d.customSubtitle,
    customImageUrl: d.customImageUrl,
    linkUrl: d.linkUrl,
    badge: d.badge,
    meta: d.meta,
    isActive: d.isActive,
  };
}

// Map a resolved curation product into the shape the storefront QuickViewDrawer wants.
// source "order" gives a clean "View Full Product" CTA; productId is set non-null so the
// drawer treats the PDP link as available.
function toQuickView(p: ResolvedProductItem): QuickViewProduct {
  return {
    source: "order",
    id: p.id,
    productId: p.sku,
    sku: p.sku,
    slug: p.slug,
    categorySlug: p.categorySlug,
    title: p.title,
    price: p.price,
    originalPrice: p.originalPrice,
    image: p.image ?? "",
    images: p.image ? [p.image] : [],
    color: { name: "", hex: "" },
    badges: p.badges,
    tags: [],
  };
}

// Map a working draft item to the resolved shape the storefront components consume,
// so the live preview renders exactly what shoppers will see (incl. per-item badge
// overrides). Product drafts whose product is missing/unpublished are dropped, just
// as the backend skips them at read time.
function draftToResolved(d: DraftItem): ResolvedItem | null {
  if (d.kind === "product") {
    if (!d.product) return null;
    const badges = d.badge ? [...new Set([...d.product.badges, d.badge])] : d.product.badges;
    return { ...d.product, id: d.tempId, badges };
  }
  return {
    kind: "editorial",
    id: d.tempId,
    title: d.customTitle,
    subtitle: d.customSubtitle,
    image: d.customImageUrl,
    link: d.linkUrl,
    badge: d.badge,
    meta: d.meta ?? {},
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Product picker modal
// ═════════════════════════════════════════════════════════════════════════════
function ProductPickerModal({
  onClose,
  onAdd,
  onQuickView,
  alreadyAdded,
}: {
  onClose: () => void;
  onAdd: (p: ResolvedProductItem) => void;
  onQuickView: (p: ResolvedProductItem) => void;
  alreadyAdded: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResolvedProductItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const t = setTimeout(() => {
      searchProducts(query.trim())
        .then((products) => { if (!cancelled) setResults(products); })
        .catch((err) => { if (!cancelled) toast.error(err instanceof Error ? err.message : "Search failed"); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Add a product</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or SKU…"
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <PackageX className="w-8 h-8 mb-2" />
              <p className="text-sm">No products found</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {results.map((p) => {
                const added = alreadyAdded.has(p.sku);
                return (
                  <li key={p.sku} className="flex items-center gap-2 rounded-lg border border-gray-100 hover:border-gray-300 transition-colors pl-1 pr-2">
                    <button
                      onClick={() => onQuickView(p)}
                      title="Quick view"
                      className="group/qv relative w-12 h-12 rounded-md overflow-hidden bg-gray-100 shrink-0 my-1"
                    >
                      {p.image && <img src={p.image} alt={p.title} className="w-full h-full object-cover" />}
                      <span className="absolute inset-0 bg-black/0 group-hover/qv:bg-black/30 transition-colors" />
                      <span className="absolute bottom-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/55 group-hover/qv:bg-black/80 transition-colors">
                        <Eye className="w-3 h-3 text-white" />
                      </span>
                    </button>
                    <button
                      disabled={added}
                      onClick={() => { onAdd(p); toast.success(`Added "${p.title}"`); }}
                      className="flex-1 min-w-0 flex items-center gap-3 py-2 text-left disabled:opacity-50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{p.title}</p>
                        <p className="text-xs text-gray-500">{p.sku} · ₹{p.price}</p>
                      </div>
                      {added ? <Check className="w-4 h-4 text-green-600 shrink-0" /> : <Plus className="w-4 h-4 text-gray-400 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Editorial tile form modal
// ═════════════════════════════════════════════════════════════════════════════
function EditorialTileModal({
  sectionKey,
  initial,
  onClose,
  onSave,
}: {
  sectionKey: SectionKey;
  initial: DraftItem | null;
  onClose: () => void;
  onSave: (d: DraftItem) => void;
}) {
  const [title, setTitle] = useState(initial?.customTitle ?? "");
  const [subtitle, setSubtitle] = useState(initial?.customSubtitle ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.customImageUrl ?? "");
  const [link, setLink] = useState(initial?.linkUrl ?? "");
  const [badge, setBadge] = useState(initial?.badge ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadProductImage(file, "curation", sectionKey);
      setImageUrl(url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!imageUrl) { toast.error("An image is required for a tile"); return; }
    // Any existing meta (size, object_position, …) is preserved untouched — those
    // extras are no longer editable from this form.
    const meta: Record<string, unknown> = { ...(initial?.meta ?? {}) };
    onSave({
      tempId: initial?.tempId ?? nextTempId(),
      kind: "editorial",
      productBaseSku: null,
      customTitle: title.trim() || null,
      customSubtitle: subtitle.trim() || null,
      customImageUrl: imageUrl,
      linkUrl: link.trim() || null,
      badge: badge.trim() || null,
      meta,
      isActive: initial?.isActive ?? true,
      product: null,
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[88vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{initial ? "Edit tile" : "Add a tile"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Image */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Image *</label>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center">
                {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-6 h-6 text-gray-300" />}
              </div>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-200 rounded-md px-3 py-2 hover:border-gray-900 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                  {uploading ? "Uploading…" : "Upload image"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ""; }}
                />
                <p className="text-[11px] text-gray-400">JPG/PNG, compressed on upload.</p>
              </div>
            </div>
          </div>

          <Field label="Title" value={title} onChange={setTitle} placeholder="e.g. Celebration Look" />
          <Field label="Subtitle / label" value={subtitle} onChange={setSubtitle} placeholder="e.g. FESTIVE EDIT" />
          <Field label="Link URL" value={link} onChange={setLink} placeholder="/collections" />
          <Field label="Badge" value={badge} onChange={setBadge} placeholder="e.g. New, Trending" />
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm font-semibold text-gray-600 px-4 py-2 hover:text-gray-900">Cancel</button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2 rounded-lg"
            style={{ backgroundColor: TEAL }}
          >
            <Check className="w-4 h-4" /> {initial ? "Update tile" : "Add tile"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Item row
// ═════════════════════════════════════════════════════════════════════════════
function ItemRow({
  item,
  index,
  total,
  onMove,
  onRemove,
  onEdit,
  onQuickView,
}: {
  item: DraftItem;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onEdit: () => void;
  onQuickView: (p: ResolvedProductItem) => void;
}) {
  const isProduct = item.kind === "product";
  const img = isProduct ? item.product?.image ?? null : item.customImageUrl;
  const missing = isProduct && !item.product; // product unpublished/deleted
  const title = isProduct ? item.product?.title ?? item.productBaseSku ?? "Unknown product" : item.customTitle ?? "Untitled tile";
  const sub = isProduct ? `${item.productBaseSku ?? ""}${item.product ? ` · ₹${item.product.price}` : ""}` : item.customSubtitle ?? "";

  return (
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white border border-gray-300 text-xs font-bold text-black tabular-nums shrink-0">{index + 1}</span>
      <div className={`flex-1 min-w-0 flex items-center gap-3 p-2.5 rounded-xl border shadow-sm ${missing ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"}`}>
      <div className="flex flex-col">
        <button onClick={() => onMove(-1)} disabled={index === 0} className="text-gray-400 hover:text-gray-900 disabled:opacity-25"><ArrowUp className="w-4 h-4" /></button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-gray-400 hover:text-gray-900 disabled:opacity-25"><ArrowDown className="w-4 h-4" /></button>
      </div>

      {isProduct && item.product ? (
        <button
          onClick={() => onQuickView(item.product as ResolvedProductItem)}
          title="Quick view"
          className="group/qv relative w-12 h-12 rounded-lg overflow-hidden bg-gray-200 shrink-0"
        >
          {img ? <img src={img} alt={title} className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-gray-300" />}
          <span className="absolute inset-0 bg-black/0 group-hover/qv:bg-black/30 transition-colors" />
          <span className="absolute bottom-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/55 group-hover/qv:bg-black/80 transition-colors">
            <Eye className="w-3 h-3 text-white" />
          </span>
        </button>
      ) : (
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 shrink-0 flex items-center justify-center">
          {img ? <img src={img} alt={title} className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-gray-300" />}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* On narrow screens the chips would leave the title only a character or two,
            so the row wraps: title takes its own full line (truncating), chips drop to
            a second line. From sm: up everything sits inline as before. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <p className="w-full sm:w-auto sm:flex-1 sm:min-w-0 text-sm font-semibold text-gray-900 truncate">{title}</p>
          <span className={`shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${isProduct ? "bg-teal-50 text-teal-700" : "bg-violet-50 text-violet-700"}`}>
            {isProduct ? "Product" : "Tile"}
          </span>
          {item.badge && <span className="shrink-0 max-w-[120px] truncate text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{item.badge}</span>}
        </div>
        <p className="text-xs text-gray-500 truncate">{missing ? "⚠ Product no longer published — will be skipped" : sub}</p>
      </div>

      {!isProduct && (
        <button onClick={onEdit} className="text-gray-400 hover:text-gray-900 p-1.5"><Pencil className="w-4 h-4" /></button>
      )}
      <button onClick={onRemove} className="text-gray-400 hover:text-red-600 p-1.5"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// True device viewports the preview iframe renders at. The frame is laid out at this
// exact size (so the components see a real desktop/phone viewport and render exactly
// as on the live site) and is then visually scaled down to fit the editor pane.
const PREVIEW_VIEWPORTS = {
  desktop: { w: 1440, h: 900 },
  mobile:  { w: 390,  h: 844 },
} as const;

// Per-tab editing state: the working draft plus the snapshot it was last saved at
// (used to detect unsaved changes). One entry per open tab. `updatedAt` is the
// section version the draft is based on — sent with the save so a concurrent edit
// by another tab/admin is rejected (409) instead of silently overwritten.
interface TabState {
  draft: DraftItem[];
  snapshot: string;
  updatedAt: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Page
// ═════════════════════════════════════════════════════════════════════════════
const CurationPage = () => {
  const { user, loading: authLoading } = useAuth();

  const [sections, setSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chrome-style tabs: several sections can be open at once, each keeping its own
  // working draft + saved snapshot. `openTabs` is the ordered tab strip, `activeKey`
  // the focused tab, `tabs` the per-section editing state.
  const [openTabs, setOpenTabs] = useState<SectionKey[]>([]);
  const [activeKey, setActiveKey] = useState<SectionKey | null>(null);
  const [tabs, setTabs] = useState<Record<string, TabState>>({});
  // Which page groups are expanded in the sidebar. Multiple can be open at once;
  // Dashboard open by default.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["Dashboard"]));
  const [saving, setSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [tileEditing, setTileEditing] = useState<{ item: DraftItem | null } | null>(null);
  const [quickView, setQuickView] = useState<ResolvedProductItem | null>(null);

  const selected = useMemo(() => sections.find((s) => s.key === activeKey) ?? null, [sections, activeKey]);
  const activeTab = activeKey ? tabs[activeKey] : undefined;
  const draft = useMemo(() => activeTab?.draft ?? [], [activeTab]);
  const savedSnapshot = activeTab?.snapshot ?? "[]";
  const dirty = useMemo(
    () => !!activeTab && JSON.stringify(draft.map(toInput)) !== savedSnapshot,
    [activeTab, draft, savedSnapshot],
  );

  // True when a (possibly inactive) tab has unsaved edits — drives the tab's dot.
  const isTabDirty = (key: SectionKey): boolean => {
    const t = tabs[key];
    return !!t && JSON.stringify(t.draft.map(toInput)) !== t.snapshot;
  };

  // In-app tab close confirms before discarding, but a browser refresh/back/close
  // would silently drop every tab's draft — hook beforeunload while anything is dirty.
  const anyTabDirty = useMemo(
    () => openTabs.some((k) => {
      const t = tabs[k];
      return !!t && JSON.stringify(t.draft.map(toInput)) !== t.snapshot;
    }),
    [openTabs, tabs],
  );
  useEffect(() => {
    if (!anyTabDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // legacy requirement for the browser prompt to show
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyTabDirty]);

  // Mutate the active tab's draft in place.
  const updateActiveDraft = (updater: (prev: DraftItem[]) => DraftItem[]) => {
    if (!activeKey) return;
    setTabs((prev) => {
      const t = prev[activeKey];
      if (!t) return prev;
      return { ...prev, [activeKey]: { ...t, draft: updater(t.draft) } };
    });
  };

  // The live preview is resolved by the backend so it matches the storefront exactly,
  // including the product top-up (curated picks + catalog fill). `draftResolved` is the
  // client-side curated-only view, shown instantly while the backend resolves and used
  // as a fallback if the preview request fails. `filled` is tagged with its section key
  // so a stale result from a previous section is never rendered.
  const draftResolved = useMemo(
    () => draft.map(draftToResolved).filter((x): x is ResolvedItem => x !== null),
    [draft],
  );
  const [filled, setFilled] = useState<{ key: SectionKey; items: ResolvedItem[] } | null>(null);
  const previewItems = filled && selected && filled.key === selected.key ? filled.items : draftResolved;

  // The preview renders in an <iframe> (own viewport → real responsive breakpoints,
  // and no clipping from the editor column). The frame announces itself with a
  // "ready" message; after that, every draft change is pushed into it.
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("mobile");

  // Scale-to-fit: the iframe is laid out at the device's true viewport size and
  // shrunk visually with transform. Media queries inside respond to the layout
  // width, so the desktop preview shows the genuine desktop rendering.
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    // ResizeObserver fires once on observe, so no synchronous initial measure needed.
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (!width) return;
      const target = PREVIEW_VIEWPORTS[previewDevice].w;
      setPreviewScale(Math.min(1, width / target));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewDevice, selected]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: string } | null)?.type === "curation-preview-ready") {
        console.log("[Curation] preview frame ready");
        setPreviewReady(true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!previewReady || !selected) return;
    previewFrameRef.current?.contentWindow?.postMessage(
      { type: "curation-preview-items", key: selected.key, items: previewItems },
      window.location.origin,
    );
  }, [previewReady, selected, previewItems]);

  const loadSections = () => {
    setLoading(true);
    setError(null);
    fetchAdminSections()
      .then((data) => {
        setSections(data);
        // Don't auto-open a section — the admin drills in: pick a page group, then a section.
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Could not load sections";
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadSections, []);

  // Resolve the live preview on the backend (debounced) so it shows the real storefront
  // output — curated picks plus the auto-filled catalog products — for the current draft.
  // The debounce only cancels pending timers, not in-flight requests, so two quick edits
  // can produce overlapping requests whose responses land out of order. Each request is
  // stamped with a sequence number and only the latest one may set state.
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!selected) return;
    const key = selected.key;
    const payload = draft.map(toInput);
    const seq = ++previewSeq.current;
    const t = setTimeout(() => {
      previewSection(key, payload)
        .then((items) => {
          if (seq !== previewSeq.current) {
            console.log(`[Curation] preview ${key} (seq ${seq}) superseded — dropped`);
            return;
          }
          console.log(`[Curation] preview ${key} → ${items.length} resolved item(s)`);
          setFilled({ key, items });
        })
        .catch((err) => {
          // Keep the instant client-side (curated-only) view on failure.
          console.warn(`[Curation] preview ${key} failed — showing curated only`, err);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [selected, draft]);

  // Open a section in a tab (or focus it if already open). Drafts of other open tabs
  // are preserved, so you can switch freely without losing work.
  const openSection = (key: SectionKey) => {
    setOpenTabs((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setTabs((prev) => {
      if (prev[key]) return prev; // keep an already-open tab's edits
      const section = sections.find((s) => s.key === key);
      const items = (section?.items ?? []).map(toDraft);
      console.log(`[Curation] opened ${key} — ${items.length} item(s)  version=${section?.updatedAt ?? "?"}`);
      return { ...prev, [key]: { draft: items, snapshot: JSON.stringify(items.map(toInput)), updatedAt: section?.updatedAt ?? null } };
    });
    setActiveKey(key);
    const g = groupOf(key);
    if (g) setOpenGroups((prev) => (prev.has(g) ? prev : new Set(prev).add(g)));
  };

  // Close a tab; confirm first if it has unsaved edits. Falls back to a neighbour tab.
  const closeTab = (key: SectionKey, e?: MouseEvent) => {
    e?.stopPropagation();
    if (isTabDirty(key) && !window.confirm("Discard unsaved changes to this section?")) return;
    const idx = openTabs.indexOf(key);
    const nextTabs = openTabs.filter((k) => k !== key);
    setOpenTabs(nextTabs);
    setTabs((prev) => { const n = { ...prev }; delete n[key]; return n; });
    if (key === activeKey) setActiveKey(nextTabs[idx] ?? nextTabs[idx - 1] ?? null);
  };

  const closeAllTabs = () => {
    const dirtyCount = openTabs.filter(isTabDirty).length;
    if (dirtyCount > 0 && !window.confirm(`Discard unsaved changes in ${dirtyCount} tab(s)?`)) return;
    setOpenTabs([]);
    setTabs({});
    setActiveKey(null);
  };

  const move = (index: number, dir: -1 | 1) => {
    updateActiveDraft((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeAt = (index: number) => updateActiveDraft((prev) => prev.filter((_, i) => i !== index));

  const addProduct = (p: ResolvedProductItem) => {
    updateActiveDraft((prev) => [
      ...prev,
      {
        tempId: nextTempId(),
        kind: "product",
        productBaseSku: p.sku,
        customTitle: null, customSubtitle: null, customImageUrl: null,
        linkUrl: null, badge: null, meta: {}, isActive: true,
        product: p,
      },
    ]);
  };

  const upsertTile = (d: DraftItem) => {
    updateActiveDraft((prev) => {
      const idx = prev.findIndex((x) => x.tempId === d.tempId);
      if (idx === -1) return [...prev, d];
      const next = [...prev];
      next[idx] = d;
      return next;
    });
    setTileEditing(null);
  };

  const save = async () => {
    if (!selected || !activeKey) return;
    setSaving(true);
    try {
      const snapshot = JSON.stringify(draft.map(toInput));
      const { updatedAt } = await saveSectionItems(selected.key, draft.map(toInput), activeTab?.updatedAt ?? null);
      setTabs((prev) => (prev[activeKey] ? { ...prev, [activeKey]: { ...prev[activeKey], snapshot, updatedAt } } : prev));
      // Reflect the new count + version in the sidebar without a full refetch.
      setSections((prev) => prev.map((s) => (s.key === selected.key ? { ...s, updatedAt: updatedAt ?? s.updatedAt, items: draft.map((d, i) => ({
        id: d.tempId, sortOrder: i, kind: d.kind, productBaseSku: d.productBaseSku,
        customTitle: d.customTitle, customSubtitle: d.customSubtitle, customImageUrl: d.customImageUrl,
        linkUrl: d.linkUrl, badge: d.badge, meta: d.meta, isActive: d.isActive, product: d.product,
      })) } : s)));
      toast.success(`Saved "${selected.title}"`);
    } catch (err) {
      if (err instanceof StaleSaveError) {
        // Someone else (another tab/admin) saved this section after this tab loaded it.
        // Keep the draft, refresh the sidebar + this tab's base version — a deliberate
        // second Save then overwrites with full knowledge.
        console.warn(`[Curation] stale save rejected for ${selected.key} — adopting latest version`, err);
        try {
          const fresh = await fetchAdminSections();
          setSections(fresh);
          const latest = fresh.find((s) => s.key === selected.key);
          if (latest) {
            setTabs((prev) => (prev[activeKey] ? { ...prev, [activeKey]: { ...prev[activeKey], updatedAt: latest.updatedAt } } : prev));
          }
        } catch (refetchErr) {
          console.warn("[Curation] refetch after stale save failed", refetchErr);
        }
        toast.error("This section was changed by another tab or admin. Your draft is kept — review it, then Save again to overwrite their version.", { duration: 8000 });
      } else {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (section: AdminSection) => {
    const next = !section.isEnabled;
    setSections((prev) => prev.map((s) => (s.key === section.key ? { ...s, isEnabled: next } : s)));
    try {
      const { updatedAt } = await updateSection(section.key, { isEnabled: next });
      // The toggle bumps the section's updated_at (touch trigger) — adopt the new
      // version in the sidebar and any open tab, or that tab's next save would 409
      // on the admin's own toggle.
      if (updatedAt) {
        setSections((prev) => prev.map((s) => (s.key === section.key ? { ...s, updatedAt } : s)));
        setTabs((prev) => (prev[section.key] ? { ...prev, [section.key]: { ...prev[section.key], updatedAt } } : prev));
      }
      toast.success(`${section.title} ${next ? "enabled" : "hidden"}`);
    } catch (err) {
      setSections((prev) => prev.map((s) => (s.key === section.key ? { ...s, isEnabled: !next } : s)));
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const canAddProduct = selected && (selected.itemType === "product" || selected.itemType === "mixed");
  const canAddTile = selected && (selected.itemType === "editorial" || selected.itemType === "mixed");

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      {user ? <UserNavbar /> : <Navbar />}

      {/* Header */}
      <div className="pt-[160px] md:pt-[128px] px-6 lg:px-12 bg-white border-b border-gray-100 pb-8">
        <div className="max-w-screen-2xl mx-auto space-y-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>Merchandising</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Curation Studio</h1>
          <p className="text-sm text-gray-500">Control which products and tiles appear across the storefront.</p>
        </div>
      </div>

      <main className="flex-1 px-6 lg:px-12 py-8">
        <div className="max-w-screen-2xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : error ? (
            <div className="w-full py-20 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <PackageX size={44} className="text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-800 mb-1">Couldn't load sections</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
              {/* ── Sidebar: page groups → sections ── */}
              <aside className="space-y-2.5">
                {SECTION_GROUPS.map((group) => {
                  const groupSections = group.keys
                    .map((k) => sections.find((s) => s.key === k))
                    .filter((s): s is AdminSection => !!s);
                  if (groupSections.length === 0) return null;
                  const isOpen = openGroups.has(group.label);
                  const GroupIcon = group.icon;
                  return (
                    <div key={group.label} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
                      {/* Page header */}
                      <button
                        onClick={() => setOpenGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.label)) next.delete(group.label);
                          else next.add(group.label);
                          return next;
                        })}
                        className="w-full flex items-center justify-between gap-2 px-3.5 py-3 bg-[#B19CD9] hover:bg-[#A58BD1] transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GroupIcon className="w-4 h-4 text-gray-700 shrink-0" />
                          <span className="font-display text-sm font-bold text-gray-900 truncate">{group.label}</span>
                          <span className="text-[11px] font-semibold text-gray-600">{groupSections.length}</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>

                      {/* Sections inside the page */}
                      {isOpen && (
                        <div className="p-2 space-y-1.5 border-t border-gray-100">
                          {groupSections.map((s) => {
                            const active = s.key === activeKey;
                            const open = openTabs.includes(s.key);
                            return (
                              <div key={s.key} className="flex items-center gap-1.5">
                                <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <button
                                  onClick={() => openSection(s.key)}
                                  className={`flex-1 min-w-0 text-left p-3 rounded-lg border-2 bg-gray-200 transition-all ${active ? "border-gray-900 shadow-sm" : "border-transparent hover:border-[#B19CD9]"}`}
                                >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <LayoutGrid className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                    <span className="font-display text-sm font-semibold text-gray-900 truncate">{s.title}</span>
                                    {open && <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" title="Open in a tab" />}
                                  </div>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => { e.stopPropagation(); void toggleEnabled(s); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void toggleEnabled(s); } }}
                                    className={`shrink-0 ${s.isEnabled ? "text-green-600" : "text-gray-300"}`}
                                    title={s.isEnabled ? "Visible on storefront — click to hide" : "Hidden — click to show"}
                                  >
                                    {s.isEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-1 pl-5">
                                  <span className="text-[11px] text-gray-400 capitalize">{s.itemType}</span>
                                  <span className="text-[11px] text-gray-300">·</span>
                                  <span className="text-[11px] text-gray-400">{s.items.length} item{s.items.length !== 1 ? "s" : ""}</span>
                                </div>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </aside>

              {/* ── Editor ── */}
              <section className="min-w-0">
                {/* Chrome-style tab strip for the open sections */}
                {openTabs.length > 0 && (
                  <div className="flex items-end gap-1 overflow-x-auto no-scrollbar">
                    {openTabs.map((key) => {
                      const sec = sections.find((s) => s.key === key);
                      if (!sec) return null;
                      const isActive = key === activeKey;
                      return (
                        <div
                          key={key}
                          onClick={() => setActiveKey(key)}
                          onAuxClick={(e) => { if (e.button === 1) closeTab(key, e); }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter") setActiveKey(key); }}
                          title="Middle-click to close"
                          className={`group/tab flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 rounded-t-lg border border-b-0 cursor-pointer whitespace-nowrap transition-colors max-w-[180px] ${isActive ? "bg-white border-gray-200 shadow-sm" : "bg-gray-100/70 border-transparent hover:bg-gray-100"}`}
                        >
                          <span className={`font-display text-xs truncate ${isActive ? "font-semibold text-gray-900" : "font-medium text-gray-500"}`}>{sec.title}</span>
                          {isTabDirty(key) && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />}
                          <button
                            onClick={(e) => closeTab(key, e)}
                            className="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 shrink-0"
                            aria-label={`Close ${sec.title}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                    {openTabs.length > 1 && (
                      <button
                        onClick={closeAllTabs}
                        className="ml-1 mb-2 self-end shrink-0 text-xs font-semibold text-gray-500 hover:text-red-600 px-2 py-1 rounded transition-colors"
                      >
                        Close all
                      </button>
                    )}
                  </div>
                )}
                {!selected ? (
                  <div className="py-20 text-center text-gray-400">Select a section from the sidebar to open it in a tab.</div>
                ) : (
                  <div className="border border-gray-100 rounded-2xl rounded-tl-none bg-white shadow-sm overflow-hidden">
                    {/* Editor header */}
                    <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-100">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-gray-900 truncate">{selected.title}</h2>
                        <p className="text-xs text-gray-500">
                          {selected.itemType === "product" && "Holds catalog products. Empty = random products shown automatically."}
                          {selected.itemType === "editorial" && "Holds custom image/title/link tiles."}
                          {selected.itemType === "mixed" && "Holds products and/or custom tiles."}
                          {" "}Max {selected.maxItems}.
                        </p>
                      </div>
                      <button
                        onClick={() => void save()}
                        disabled={!dirty || saving}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-40 shrink-0"
                        style={{ backgroundColor: dirty ? TEAL : "#9ca3af" }}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
                      </button>
                    </div>

                    {/* Add buttons */}
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                      {canAddProduct && (
                        <button
                          onClick={() => setPickerOpen(true)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-200 rounded-md px-3 py-2 bg-white hover:border-gray-900"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add product
                        </button>
                      )}
                      {canAddTile && (
                        <button
                          onClick={() => setTileEditing({ item: null })}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-200 rounded-md px-3 py-2 bg-white hover:border-gray-900"
                        >
                          <ImagePlus className="w-3.5 h-3.5" /> Add tile
                        </button>
                      )}
                      {draft.length > selected.maxItems && (
                        <span className="text-xs text-amber-600 ml-auto">Over the {selected.maxItems}-item cap — only the first {selected.maxItems} will show on the storefront.</span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="p-4 space-y-2 bg-gray-100">
                      {draft.length === 0 ? (
                        <div className="py-14 text-center">
                          <p className="text-sm font-semibold text-gray-700 mb-1">No items yet</p>
                          <p className="text-xs text-gray-500">
                            {selected.itemType === "editorial"
                              ? "Add tiles to populate this section."
                              : "Empty — the storefront will show random products automatically. Add products to curate."}
                          </p>
                        </div>
                      ) : (
                        draft.map((item, i) => (
                          <ItemRow
                            key={item.tempId}
                            item={item}
                            index={i}
                            total={draft.length}
                            onMove={(dir) => move(i, dir)}
                            onRemove={() => removeAt(i)}
                            onEdit={() => setTileEditing({ item })}
                            onQuickView={(p) => setQuickView(p)}
                          />
                        ))
                      )}
                    </div>

                    {/* Live preview — the real storefront component rendered inside an
                        iframe, so its viewport (and therefore the mobile/desktop styles)
                        matches the chosen device width instead of the editor column. */}
                    <div className="mt-40 border-t border-gray-100">
                      <div className="flex items-center gap-2 px-5 py-3 bg-gray-50/60">
                        <Eye className="w-4 h-4 text-gray-500 shrink-0" />
                        <span className="text-sm font-semibold text-gray-700">Live preview</span>
                        <span className="text-xs text-gray-400 truncate hidden sm:inline">
                          How this section appears on the storefront — reflects unsaved changes.
                        </span>
                        <div className="ml-auto flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setPreviewDevice("mobile")}
                            title="Mobile preview"
                            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${previewDevice === "mobile" ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-700 hover:bg-gray-200"}`}
                          >
                            <Smartphone className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setPreviewDevice("desktop")}
                            title="Desktop preview"
                            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${previewDevice === "desktop" ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-700 hover:bg-gray-200"}`}
                          >
                            <Monitor className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-100/60 p-3 sm:p-4">
                        <div ref={previewWrapRef} className="flex justify-center">
                          {/* Sized box = scaled footprint; the iframe inside is laid out at
                              the true viewport size and transform-scaled to fit. The phone
                              bezel uses a ring (box-shadow) so it doesn't eat into the
                              viewport width. */}
                          <div
                            className={`overflow-hidden bg-white ${
                              previewDevice === "mobile"
                                ? "rounded-[1.75rem] ring-[6px] ring-gray-900 shadow-xl my-2"
                                : "rounded-lg ring-1 ring-gray-200 shadow-sm"
                            }`}
                            style={{
                              width: PREVIEW_VIEWPORTS[previewDevice].w * previewScale,
                              height: PREVIEW_VIEWPORTS[previewDevice].h * previewScale,
                            }}
                          >
                            <iframe
                              ref={previewFrameRef}
                              src="/admin/curation/preview"
                              title="Section live preview"
                              className="border-0 bg-white"
                              style={{
                                width: PREVIEW_VIEWPORTS[previewDevice].w,
                                height: PREVIEW_VIEWPORTS[previewDevice].h,
                                transform: `scale(${previewScale})`,
                                transformOrigin: "top left",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {pickerOpen && selected && (
        <ProductPickerModal
          onClose={() => setPickerOpen(false)}
          onAdd={addProduct}
          onQuickView={(p) => setQuickView(p)}
          alreadyAdded={new Set(draft.filter((d) => d.kind === "product" && d.productBaseSku).map((d) => d.productBaseSku as string))}
        />
      )}

      <QuickViewDrawer
        open={!!quickView}
        product={quickView ? toQuickView(quickView) : null}
        onClose={() => setQuickView(null)}
        hideBuyNow
      />

      {tileEditing && selected && (
        <EditorialTileModal
          sectionKey={selected.key}
          initial={tileEditing.item}
          onClose={() => setTileEditing(null)}
          onSave={upsertTile}
        />
      )}
    </div>
  );
};

export default CurationPage;
