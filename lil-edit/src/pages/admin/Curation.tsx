import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  LayoutGrid,
  LayoutDashboard,
  ShoppingBag,
  ChevronDown,
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
} from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { uploadProductImage } from "@/lib/uploadImage";
import QuickViewDrawer, { type QuickViewProduct } from "@/components/product/QuickViewDrawer";
import TrendingSection from "@/components/home/TrendingSection";
import RecommendedForYou from "@/components/home/RecommendedForYou";
import ShopTheLook from "@/components/home/ShopTheLook";
import FeaturedCategories from "@/components/home/FeaturedCategories";
import HomeCollage from "@/components/home/HomeCollage";
import FrequentSearches from "@/components/search/FrequentSearches";
import CollageGrid from "@/components/search/CollageGrid";
import FeaturedCollectionsGrid from "@/components/collections/FeaturedCollectionsGrid";
import {
  fetchAdminSections,
  saveSectionItems,
  updateSection,
  searchProducts,
  previewSection,
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

const metaStr = (meta: Record<string, unknown>, key: string): string =>
  typeof meta[key] === "string" ? (meta[key] as string) : "";

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

// One real storefront component per section, fed the draft items as previewItems.
const PREVIEW_RENDERERS: Record<SectionKey, (items: ResolvedItem[]) => JSX.Element> = {
  home_trending: (items) => <TrendingSection previewItems={items} />,
  home_recommended: (items) => <RecommendedForYou previewItems={items} />,
  search_popular: (items) => <FrequentSearches previewItems={items} onSelect={() => {}} />,
  search_discover: (items) => <CollageGrid previewItems={items} />,
  home_shop_the_look: (items) => <ShopTheLook previewItems={items} />,
  home_featured_categories: (items) => <FeaturedCategories previewItems={items} />,
  home_collage: (items) => <HomeCollage previewItems={items} />,
  collections_featured: (items) => <FeaturedCollectionsGrid previewItems={items} />,
};

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
  const [size, setSize] = useState(metaStr(initial?.meta ?? {}, "size"));
  const [objectPosition, setObjectPosition] = useState(metaStr(initial?.meta ?? {}, "object_position"));
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
    const meta: Record<string, unknown> = { ...(initial?.meta ?? {}) };
    if (size) meta.size = size; else delete meta.size;
    if (objectPosition) meta.object_position = objectPosition; else delete meta.object_position;
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Card size</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900 bg-white"
              >
                <option value="">Default</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <Field label="Object position" value={objectPosition} onChange={setObjectPosition} placeholder="center 15%" />
          </div>
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
    <div className={`flex items-center gap-3 p-2.5 rounded-xl border bg-white ${missing ? "border-red-200 bg-red-50/40" : "border-gray-100"}`}>
      <div className="flex flex-col">
        <button onClick={() => onMove(-1)} disabled={index === 0} className="text-gray-400 hover:text-gray-900 disabled:opacity-25"><ArrowUp className="w-4 h-4" /></button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-gray-400 hover:text-gray-900 disabled:opacity-25"><ArrowDown className="w-4 h-4" /></button>
      </div>

      {isProduct && item.product ? (
        <button
          onClick={() => onQuickView(item.product as ResolvedProductItem)}
          title="Quick view"
          className="group/qv relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0"
        >
          {img ? <img src={img} alt={title} className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-gray-300" />}
          <span className="absolute inset-0 bg-black/0 group-hover/qv:bg-black/30 transition-colors" />
          <span className="absolute bottom-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/55 group-hover/qv:bg-black/80 transition-colors">
            <Eye className="w-3 h-3 text-white" />
          </span>
        </button>
      ) : (
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
          {img ? <img src={img} alt={title} className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-gray-300" />}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${isProduct ? "bg-teal-50 text-teal-700" : "bg-violet-50 text-violet-700"}`}>
            {isProduct ? "Product" : "Tile"}
          </span>
          {item.badge && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{item.badge}</span>}
        </div>
        <p className="text-xs text-gray-500 truncate">{missing ? "⚠ Product no longer published — will be skipped" : sub}</p>
      </div>

      {!isProduct && (
        <button onClick={onEdit} className="text-gray-400 hover:text-gray-900 p-1.5"><Pencil className="w-4 h-4" /></button>
      )}
      <button onClick={onRemove} className="text-gray-400 hover:text-red-600 p-1.5"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Page
// ═════════════════════════════════════════════════════════════════════════════
const CurationPage = () => {
  const { user, loading: authLoading } = useAuth();

  const [sections, setSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<SectionKey | null>(null);
  // Which page group is expanded in the sidebar (accordion). Dashboard open by default.
  const [openGroup, setOpenGroup] = useState<string | null>("Dashboard");
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("[]");
  const [saving, setSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [tileEditing, setTileEditing] = useState<{ item: DraftItem | null } | null>(null);
  const [quickView, setQuickView] = useState<ResolvedProductItem | null>(null);

  const selected = useMemo(() => sections.find((s) => s.key === selectedKey) ?? null, [sections, selectedKey]);
  const dirty = useMemo(() => JSON.stringify(draft.map(toInput)) !== savedSnapshot, [draft, savedSnapshot]);

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

  // Load the selected section's items into the local draft whenever the selection changes.
  useEffect(() => {
    if (!selected) return;
    const items = selected.items.map(toDraft);
    setDraft(items);
    setSavedSnapshot(JSON.stringify(items.map(toInput)));
    console.log(`[Curation] selected ${selected.key} — ${items.length} item(s)`);
  }, [selected]);

  // Resolve the live preview on the backend (debounced) so it shows the real storefront
  // output — curated picks plus the auto-filled catalog products — for the current draft.
  useEffect(() => {
    if (!selected) return;
    const key = selected.key;
    const payload = draft.map(toInput);
    const t = setTimeout(() => {
      previewSection(key, payload)
        .then((items) => {
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

  const selectSection = (key: SectionKey) => {
    if (dirty && !window.confirm("Discard unsaved changes to this section?")) return;
    setSelectedKey(key);
    setOpenGroup(groupOf(key));
  };

  const move = (index: number, dir: -1 | 1) => {
    setDraft((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeAt = (index: number) => setDraft((prev) => prev.filter((_, i) => i !== index));

  const addProduct = (p: ResolvedProductItem) => {
    setDraft((prev) => [
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
    setDraft((prev) => {
      const idx = prev.findIndex((x) => x.tempId === d.tempId);
      if (idx === -1) return [...prev, d];
      const next = [...prev];
      next[idx] = d;
      return next;
    });
    setTileEditing(null);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await saveSectionItems(selected.key, draft.map(toInput));
      setSavedSnapshot(JSON.stringify(draft.map(toInput)));
      // Reflect the new count in the sidebar without a full refetch.
      setSections((prev) => prev.map((s) => (s.key === selected.key ? { ...s, items: draft.map((d, i) => ({
        id: d.tempId, sortOrder: i, kind: d.kind, productBaseSku: d.productBaseSku,
        customTitle: d.customTitle, customSubtitle: d.customSubtitle, customImageUrl: d.customImageUrl,
        linkUrl: d.linkUrl, badge: d.badge, meta: d.meta, isActive: d.isActive, product: d.product,
      })) } : s)));
      toast.success(`Saved "${selected.title}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (section: AdminSection) => {
    const next = !section.isEnabled;
    setSections((prev) => prev.map((s) => (s.key === section.key ? { ...s, isEnabled: next } : s)));
    try {
      await updateSection(section.key, { isEnabled: next });
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
                  const isOpen = openGroup === group.label;
                  const GroupIcon = group.icon;
                  return (
                    <div key={group.label} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
                      {/* Page header */}
                      <button
                        onClick={() => setOpenGroup((prev) => (prev === group.label ? null : group.label))}
                        className="w-full flex items-center justify-between gap-2 px-3.5 py-3 bg-gray-50/70 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GroupIcon className="w-4 h-4 text-gray-500 shrink-0" />
                          <span className="text-sm font-bold text-gray-900 truncate">{group.label}</span>
                          <span className="text-[11px] font-semibold text-gray-400">{groupSections.length}</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>

                      {/* Sections inside the page */}
                      {isOpen && (
                        <div className="p-2 space-y-1.5 border-t border-gray-100">
                          {groupSections.map((s) => {
                            const active = s.key === selectedKey;
                            return (
                              <button
                                key={s.key}
                                onClick={() => selectSection(s.key)}
                                className={`w-full text-left p-3 rounded-lg border transition-all ${active ? "border-gray-900 bg-gray-50 shadow-sm" : "border-gray-100 hover:border-gray-300"}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <LayoutGrid className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    <span className="text-sm font-semibold text-gray-900 truncate">{s.title}</span>
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
                {!selected ? (
                  <div className="py-20 text-center text-gray-400">Select a section to edit.</div>
                ) : (
                  <div className="border border-gray-100 rounded-2xl bg-white shadow-sm overflow-hidden">
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
                        <span className="text-xs text-amber-600 ml-auto">Over the {selected.maxItems}-item cap — extras may not all render.</span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="p-4 space-y-2">
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

                    {/* Live preview — the real storefront component, fed the current draft */}
                    <div className="mt-40 border-t border-gray-100">
                      <div className="flex items-center gap-2 px-5 py-3 bg-gray-50/60">
                        <Eye className="w-4 h-4 text-gray-500 shrink-0" />
                        <span className="text-sm font-semibold text-gray-700">Live preview</span>
                        <span className="text-xs text-gray-400 truncate hidden sm:inline">
                          How this section appears on the storefront — reflects unsaved changes.
                        </span>
                      </div>
                      <div className="max-h-[70vh] overflow-auto bg-white">
                        {/* Capture clicks so previewing never navigates away or mutates state. */}
                        <div onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                          {PREVIEW_RENDERERS[selected.key](previewItems)}
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
