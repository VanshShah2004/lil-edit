import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
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
  RotateCcw,
} from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { uploadProductImage } from "@/lib/uploadImage";
import { metaStr } from "@/hooks/useCuratedSection";
import { SUB_COLLECTIONS, subCollectionLabel } from "@/components/collections/subCollections";
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
// Where a Home Collage tile points when the admin leaves the field empty. Mirrors
// DEFAULT_TILE_LINK in components/home/HomeCollage — keep the two in step.
const DEFAULT_TILE_LINK = "/collections";
const TEAL = "#0F766E";

// Storefront pages, each grouping the sections that live on it. The sidebar shows
// these as expandable groups → click a page to reveal its sections.
const SECTION_GROUPS: { label: string; icon: typeof LayoutGrid; keys: SectionKey[] }[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    keys: ["home_trending", "home_recommended", "home_shop_the_look", "home_featured_categories", "home_collage", "home_hero_plus"],
  },
  {
    label: "Collections Page",
    icon: ShoppingBag,
    keys: ["collections_browse"],
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

// Sections whose tiles override a storefront placard that already exists rather
// than adding a new card: "which placard + its sub-heading, picture and where it
// points". The placard's NAME stays fixed in SUB_COLLECTIONS — it is the label the
// side menu and the mini tiles use for the same link, so it is deliberately not
// editable here. Each override is optional and falls back to the shipped copy. The
// form drops the badge (placards have no badge slot) and swaps the free-text link
// for a product dropdown — a placard can then only ever point at a real published
// product, or (left empty) at its own collection listing.
//
// Each tile NAMES its placard in meta.collection, at most one tile per
// collection, so row order carries no meaning here and the reorder arrows are
// hidden. The backend enforces the same two rules on save.
const IMAGE_AND_LINK_ONLY = new Set<SectionKey>(["collections_browse"]);

// Sections stored as "mixed" that are curated as PRODUCTS ONLY. Discover More has
// a tile path in the schema and its grid still renders one, but what belongs in a
// search-results rail is catalog product — so the editor offers only that. Any tile
// already curated there keeps rendering and stays editable; this only stops new
// ones being made, which is why it lives here rather than in the section's
// item_type (changing that would also switch on the product top-up).
const PRODUCTS_ONLY = new Set<SectionKey>(["search_discover"]);

// Sections whose storefront heading is a single line, with no sub-heading rendered
// under it (see components/search/CollageGrid). "Edit heading" drops the field for
// these rather than offering a box that writes to nothing.
const NO_SECTION_SUBHEADING = new Set<SectionKey>(["search_discover"]);

// Sections that render NO heading at all — both halves of the collage carousel.
// The grid page and the HeroSection+ slides are pictures edge to edge, and
// HomeCollage doesn't even take a title prop, so there is nowhere for a heading to
// land and the button is hidden rather than left dead.
const NO_SECTION_HEADING = new Set<SectionKey>(["home_collage", "home_hero_plus"]);

// The collage carousel's two sections. A tile here is a PHOTO and where it goes:
// the carousel lays no copy over the picture, so a title, sub-heading or badge
// would be typed into nothing. Both take a picture PER BREAKPOINT, and so — in
// place of one link — a destination per breakpoint as well.
const IMAGE_AND_BREAKPOINT_LINKS = new Set<SectionKey>(["home_collage", "home_hero_plus"]);

/** The collection a tile fronts, or "" if it names none. */
function tileCollection(item: DraftItem): string {
  return metaStr(item.meta, "collection");
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
                // Curated items are stored under the product's base_sku (p.sku now
                // carries the primary variant for storefront actions).
                const added = alreadyAdded.has(p.baseSku);
                return (
                  <li key={p.baseSku} className="flex items-center gap-2 rounded-lg border border-gray-100 hover:border-gray-300 transition-colors pl-1 pr-2">
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
                        <p className="text-xs text-gray-500">{p.baseSku} · ₹{p.price}</p>
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
  takenCollections,
  lockedCollection,
  onClose,
  onSave,
}: {
  sectionKey: SectionKey;
  initial: DraftItem | null;
  /** Collections already claimed by OTHER tiles — one placard, one tile. */
  takenCollections: Set<string>;
  /** Opened from a placard card: that card already IS the collection, so the
      choice is fixed and shown as a label rather than an editable dropdown. */
  lockedCollection?: string;
  onClose: () => void;
  onSave: (d: DraftItem) => void;
}) {
  const [title, setTitle] = useState(initial?.customTitle ?? "");
  const [subtitle, setSubtitle] = useState(initial?.customSubtitle ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.customImageUrl ?? "");
  const [desktopImageUrl, setDesktopImageUrl] = useState(metaStr(initial?.meta, "desktop_image_url"));
  const [link, setLink] = useState(initial?.linkUrl ?? "");
  // Seeded with the default rather than blank so the field always shows where the
  // tile actually goes — an empty box would read as "goes nowhere".
  const [mobileLink, setMobileLink] = useState(metaStr(initial?.meta, "mobile_link_url") || DEFAULT_TILE_LINK);
  const [desktopLink, setDesktopLink] = useState(metaStr(initial?.meta, "desktop_link_url") || DEFAULT_TILE_LINK);
  const [badge, setBadge] = useState(initial?.badge ?? "");
  // Which placard this tile fronts. Chosen first — everything below it is "what
  // that placard shows", so the form reads top-down as one decision then its detail.
  const [collection, setCollection] = useState(lockedCollection ?? metaStr(initial?.meta, "collection"));
  const [uploading, setUploading] = useState(false);
  const [uploadingDesktop, setUploadingDesktop] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const desktopFileRef = useRef<HTMLInputElement>(null);

  // Placard tiles override a storefront card that already exists: its picture and
  // its sub-heading. The destination is not editable — a placard always opens its
  // own sub-collection page — and there is no badge slot on a placard.
  const imageAndLinkOnly = IMAGE_AND_LINK_ONLY.has(sectionKey);
  // The copy this placard ships with, used as the fields' placeholders so an empty
  // input visibly reads as "leave the default" rather than "erase the words".
  const placardDefaults = SUB_COLLECTIONS.find((c) => c.key === collection);
  // Shop the Look cards never render a badge (title and link only), so don't
  // offer the field there — it would be a dead input.
  const showBadge = sectionKey !== "home_shop_the_look" && !imageAndLinkOnly;
  // For the same reason, and in the same section: a Shop the Look card renders its
  // title and nothing else (see components/home/ShopTheLook), so a sub-heading typed
  // here would land nowhere. Drop the field rather than leave it as a dead input.
  const showSubtitle = sectionKey !== "home_shop_the_look";
  // Only the collage carousel sections read meta.desktop_image_url today —
  // offering the field elsewhere would be a dead control.
  const showDesktopImage = IMAGE_AND_BREAKPOINT_LINKS.has(sectionKey);
  // ...and those same sections are the picture-and-destination-only ones.
  const imageOnly = IMAGE_AND_BREAKPOINT_LINKS.has(sectionKey);

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

  const handleUploadDesktop = async (file: File) => {
    setUploadingDesktop(true);
    try {
      const url = await uploadProductImage(file, "curation", sectionKey);
      setDesktopImageUrl(url);
      toast.success("Desktop image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingDesktop(false);
    }
  };

  const handleSave = () => {
    const mobileImage = imageUrl.trim();
    const desktopImage = showDesktopImage ? desktopImageUrl.trim() : "";
    // Home Collage tiles are pure per-breakpoint overrides — mobile, desktop, or both
    // may be left empty and the storefront fills each gap with its built-in default,
    // so an all-empty tile is valid. Every other editorial section still needs its image.
    if (!showDesktopImage && !imageAndLinkOnly && !mobileImage) {
      toast.error("An image is required for a tile");
      return;
    }
    // The placard has to be chosen before there's anything to curate.
    if (imageAndLinkOnly && !collection) {
      toast.error("Choose which collection this tile is for");
      return;
    }
    // Every placard field is optional: the tile is a set of overrides on a card that
    // already renders, and each unset one falls straight through to the shipped copy.
    // An all-empty tile is therefore valid — it just leaves the placard on its
    // defaults, which is exactly what Reset produces.
    //
    // Any existing meta (size, object_position, …) is preserved untouched — those
    // extras are no longer editable from this form.
    const meta: Record<string, unknown> = { ...(initial?.meta ?? {}) };
    if (showDesktopImage) {
      if (desktopImage) meta.desktop_image_url = desktopImage;
      else delete meta.desktop_image_url;
    }
    // Each breakpoint carries its own destination. Cleared to empty, a field falls
    // back to the collections index rather than being stored blank, so a tile is
    // never saved pointing nowhere.
    if (imageOnly) {
      meta.mobile_link_url = mobileLink.trim() || DEFAULT_TILE_LINK;
      meta.desktop_link_url = desktopLink.trim() || DEFAULT_TILE_LINK;
    }
    if (imageAndLinkOnly) {
      meta.collection = collection;
      // A placard always opens its own sub-collection page, so drop the product-link
      // bookkeeping any row saved before that rule may still be carrying.
      delete meta.link_product_sku;
      delete meta.link_product_title;
    }
    onSave({
      tempId: initial?.tempId ?? nextTempId(),
      kind: "editorial",
      productBaseSku: null,
      // A placard's name and destination are fixed in the storefront component; clear
      // anything a tile carried from before so the saved row matches what the form can
      // express. The sub-heading IS editable, and empty there means "not overridden",
      // not "blank" — the storefront falls back to the copy it ships with.
      customTitle: imageOnly ? null : imageAndLinkOnly ? null : title.trim() || null,
      customSubtitle: imageOnly || !showSubtitle ? null : subtitle.trim() || null,
      customImageUrl: mobileImage || null,
      linkUrl: imageOnly ? null : imageAndLinkOnly ? null : link.trim() || null,
      // Sections without a badge slot (Shop the Look) also clear any badge a tile
      // may have carried from before. The collage sections clear the badge too.
      badge: imageOnly ? null : showBadge ? badge.trim() || null : null,
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
          {/* Which placard this tile fronts — chosen first, since the image and
              link below are only meaningful once it's known. Collections already
              taken by another tile are disabled rather than hidden, so it's clear
              they exist and are simply spoken for. */}
          {imageAndLinkOnly && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Collection *</label>
              {lockedCollection ? (
                <div className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 font-semibold text-gray-800">
                  {subCollectionLabel(lockedCollection) ?? lockedCollection}
                </div>
              ) : (
                <select
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900"
                >
                  <option value="">Choose a collection…</option>
                  {SUB_COLLECTIONS.map((c) => {
                    const taken = takenCollections.has(c.key);
                    return (
                      <option key={c.key} value={c.key} disabled={taken}>
                        {c.label}{taken ? " — already has a tile" : ""}
                      </option>
                    );
                  })}
                </select>
              )}
              <p className="mt-1.5 text-[11px] text-gray-400">
                {lockedCollection
                  ? "Every field below is optional — anything left empty keeps the placard's default. Its name is fixed, and it always opens this collection's page."
                  : "One tile per collection. Every field below is optional; the placard's name is fixed and it always opens its own collection page."}
              </p>
            </div>
          )}

          {/* Image (mobile, when a section also offers a desktop variant) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {showDesktopImage ? "Mobile image" : imageAndLinkOnly ? "Placard image" : "Image *"}
            </label>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center">
                {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-6 h-6 text-gray-300" />}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-400 rounded-md px-3 py-2 hover:border-gray-900 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    {uploading ? "Uploading…" : "Upload image"}
                  </button>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl("")}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 border border-red-300 rounded-md px-3 py-2 hover:border-red-500 hover:bg-red-50"
                    >
                      <X className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ""; }}
                />
                <p className="text-[11px] text-gray-400">
                  {showDesktopImage
                    ? "Uses the built-in collage image on mobile if left empty."
                    : imageAndLinkOnly
                      ? "Left empty, the placard keeps this collection's newest product."
                      : "JPG/PNG, compressed on upload."}
                </p>
              </div>
            </div>
          </div>

          {/* Desktop image — optional per-breakpoint override. HomeCollage renders
              meta.desktop_image_url at md+ and falls back to the built-in default
              (independent of the mobile image above). */}
          {showDesktopImage && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Desktop image (optional)</label>
              <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center">
                  {desktopImageUrl ? <img src={desktopImageUrl} alt="" className="w-full h-full object-cover" /> : <Monitor className="w-6 h-6 text-gray-300" />}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => desktopFileRef.current?.click()}
                      disabled={uploadingDesktop}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-400 rounded-md px-3 py-2 hover:border-gray-900 disabled:opacity-50"
                    >
                      {uploadingDesktop ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                      {uploadingDesktop ? "Uploading…" : "Upload image"}
                    </button>
                    {desktopImageUrl && (
                      <button
                        type="button"
                        onClick={() => setDesktopImageUrl("")}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 border border-red-300 rounded-md px-3 py-2 hover:border-red-500 hover:bg-red-50"
                      >
                        <X className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={desktopFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadDesktop(f); e.target.value = ""; }}
                  />
                  <p className="text-[11px] text-gray-400">Uses the built-in collage image on desktop if left empty.</p>
                </div>
              </div>
            </div>
          )}

          {/* One destination per breakpoint — the phone crop and the desktop crop
              can be different pictures, so they can want different landings. */}
          {imageOnly && (
            <>
              <Field label="Mobile link" value={mobileLink} onChange={setMobileLink} placeholder={DEFAULT_TILE_LINK} />
              <Field label="Desktop link" value={desktopLink} onChange={setDesktopLink} placeholder={DEFAULT_TILE_LINK} />
              <p className="-mt-2 text-[11px] text-gray-400">
                A storefront path like <code>/collections/girls</code>. Left empty, the tile
                opens <code>{DEFAULT_TILE_LINK}</code>.
              </p>
            </>
          )}

          {!imageOnly && (
            <>
              {imageAndLinkOnly ? (
                /* The name and the destination are both fixed in SUB_COLLECTIONS, so the
                   picture above and this sub-heading are the whole form. The placeholder
                   carries the shipped copy, making an empty field read as "keep the
                   default" — which is exactly what saving empty does. */
                <Field
                  label="Sub-heading"
                  value={subtitle}
                  onChange={setSubtitle}
                  placeholder={placardDefaults?.blurb ?? "Leave empty for the default sub-heading"}
                />
              ) : (
                <>
                  <Field label="Title" value={title} onChange={setTitle} placeholder="e.g. Celebration Look" />
                  {showSubtitle && (
                    <Field label="Subtitle / label" value={subtitle} onChange={setSubtitle} placeholder="e.g. FESTIVE EDIT" />
                  )}
                  <Field label="Link URL" value={link} onChange={setLink} placeholder="/collections" />
                </>
              )}
              {showBadge && <Field label="Badge" value={badge} onChange={setBadge} placeholder="e.g. New, Trending" />}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm font-semibold text-red-600 border border-red-300 rounded-lg px-4 py-2 hover:border-red-500 hover:bg-red-50">Cancel</button>
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

// ═════════════════════════════════════════════════════════════════════════════
// Section heading modal — edit the title / subtitle shown on the storefront.
// ═════════════════════════════════════════════════════════════════════════════
function SectionHeadingModal({
  section,
  onClose,
  onSave,
  saving,
}: {
  section: AdminSection;
  onClose: () => void;
  onSave: (patch: { title: string; subtitle: string }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(section.title ?? "");
  const [subtitle, setSubtitle] = useState(section.subtitle ?? "");
  const showSubheading = !NO_SECTION_SUBHEADING.has(section.key);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Edit heading</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Heading" value={title} onChange={setTitle} placeholder="e.g. Trending Now" />
          {showSubheading && (
            <Field label="Subheading" value={subtitle} onChange={setSubtitle} placeholder="e.g. What everyone's loving right now" />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm font-semibold text-gray-600 px-4 py-2 hover:text-gray-900">Cancel</button>
          <button
            disabled={saving}
            // Sends empty for a section that renders none, so a sub-heading set before
            // this became a lone-line heading is cleared rather than left orphaned.
            onClick={() => onSave({ title: title.trim(), subtitle: showSubheading ? subtitle.trim() : "" })}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: TEAL }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? "Saving…" : "Save heading"}
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
        className="w-full px-3 py-2 text-sm border border-gray-400 rounded-lg focus:outline-none focus:border-gray-900"
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Placard grid — the editor for IMAGE_AND_LINK_ONLY sections
//
// This section doesn't have "a list of items you add to"; it has a FIXED set of
// placards (SUB_COLLECTIONS), each of which is either curated or showing its
// storefront default. So the editor mirrors that: one card per collection,
// always all of them, whether or not a tile exists yet. Clicking a card opens
// the tile form already bound to that collection — there is nothing to "add",
// only a placard to override, which is why the Add-tile button is hidden here.
//
// A card with no tile is not an empty slot to be filled — it's the placard
// running on its own defaults, which is a perfectly good end state. "Reset"
// deletes the tile and returns the placard to exactly that.
// ═════════════════════════════════════════════════════════════════════════════
function PlacardGrid({
  draft,
  onEdit,
  onReset,
}: {
  draft: DraftItem[];
  onEdit: (item: DraftItem | null, collection: string) => void;
  onReset: (item: DraftItem) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {SUB_COLLECTIONS.map((c) => {
        // First match wins, mirroring the storefront's tileFor() — a stale
        // duplicate from a hand-edited row can't make the card disagree with
        // the page it is previewing.
        const tile = draft.find((d) => tileCollection(d) === c.key) ?? null;
        const image = tile?.customImageUrl ?? "";
        // Resolved exactly the way BrowseCollections resolves it, so the card can
        // never disagree with the placard it is standing in for. The name and the
        // destination are fixed, so a picture and a sub-heading are all a tile holds.
        const subheading = tile?.customSubtitle || c.blurb;
        const curated = !!image || !!tile?.customSubtitle;
        const Icon = c.icon;

        return (
          <div
            key={c.key}
            className={`relative rounded-xl border bg-white shadow-sm overflow-hidden transition-colors ${curated ? "border-gray-400" : "border-dashed border-gray-300"}`}
          >
            <button
              type="button"
              onClick={() => onEdit(tile, c.key)}
              className="w-full text-left group"
            >
              {/* Preview: the curated picture if there is one, otherwise the same
                  gradient + icon the placard falls back to on the storefront. */}
              <div className={`relative h-28 bg-gradient-to-br ${c.gradient} flex items-center justify-center overflow-hidden`}>
                {image ? (
                  <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <Icon className="w-7 h-7 text-gray-500/70" />
                )}
                <span
                  className={`absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${curated ? "bg-teal-600 text-white" : "bg-white/85 text-gray-600"}`}
                >
                  {curated ? "Curated" : "Default"}
                </span>
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
              </div>

              {/* Name and sub-heading mirror the big placard — the card shows the
                  placard's own copy, nothing about how it was configured. The pencil
                  sits inline at the right, vertically centred against the block — the
                  card's only affordance, so it carries no label of its own. */}
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{c.label}</p>
                  <p className="mt-0.5 text-xs text-gray-600 line-clamp-2">{subheading}</p>
                </div>
                <span className="shrink-0 rounded-md border border-gray-300 p-1.5 text-gray-400 group-hover:border-gray-900 group-hover:text-gray-900 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </span>
              </div>
            </button>

            {/* Only offered once there is something to undo — on an uncurated
                placard the storefront default IS the current state. Lives on the
                image, opposite the status chip: the copy row below is now spoken
                for by the pencil, and nesting it inside the card's own <button>
                would be invalid markup. */}
            {tile && (
              <button
                type="button"
                onClick={() => onReset(tile)}
                title="Remove this override — the placard goes back to its defaults"
                className="absolute top-2 left-2 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 border border-red-300 rounded-md px-2 py-1 bg-white/90 hover:border-red-500 hover:bg-red-50"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>
        );
      })}
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
  showBadge = true,
  showSubtitle = true,
  namesItsPlacard = false,
  onMove,
  onRemove,
  onEdit,
  onQuickView,
}: {
  item: DraftItem;
  index: number;
  total: number;
  /** Sections whose storefront card has no badge slot (Shop the Look) hide the chip. */
  showBadge?: boolean;
  /** Sections whose storefront card renders no sub-heading (Shop the Look). */
  showSubtitle?: boolean;
  /** Tiles that name their own placard (IMAGE_AND_LINK_ONLY): drop the reorder
      arrows and the slot number, since position drives nothing for them. */
  namesItsPlacard?: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onEdit: () => void;
  onQuickView: (p: ResolvedProductItem) => void;
}) {
  const isProduct = item.kind === "product";
  // A separate desktop image is stored in meta.desktop_image_url (Home Collage only).
  // Surface a small monitor badge so the list flags tiles that carry one.
  const desktopImage = isProduct ? "" : metaStr(item.meta, "desktop_image_url");
  const hasDesktopImage = !!desktopImage;
  // Show the mobile image, or the desktop image for a desktop-only tile, so the
  // thumbnail is never blank when the tile actually has imagery.
  const img = isProduct ? item.product?.image ?? null : item.customImageUrl || desktopImage || null;
  const missing = isProduct && !item.product; // product unpublished/deleted
  // A placard tile carries no copy of its own, so the collection it names IS its
  // identity in this list, and its destination is the useful second line. A tile
  // whose collection no longer exists reads as unassigned rather than silently
  // looking fine while curating nothing.
  const placard = namesItsPlacard ? subCollectionLabel(tileCollection(item)) : null;
  const title = isProduct
    ? item.product?.title ?? item.productBaseSku ?? "Unknown product"
    : item.customTitle ?? (namesItsPlacard ? placard ?? "⚠ No collection set" : "Untitled tile");
  // A tile whose section renders no sub-heading has none to show here either, so the
  // row's second line becomes where the tile GOES — otherwise it would sit blank.
  const sub = isProduct
    ? item.productBaseSku ?? ""
    : !showSubtitle
      ? item.linkUrl ?? ""
      : item.customSubtitle ?? (namesItsPlacard
        ? metaStr(item.meta, "link_product_title") || item.linkUrl || "Opens this collection"
        : "");

  // Chips are rendered in two places (inline with the title on desktop, on their own
  // row on mobile), so the styles live here once.
  const kindChip = "shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-50 text-violet-700";
  const badgeChip = "shrink-0 max-w-[120px] truncate text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700";

  // The slot number is overlaid on the thumbnail's corner (instead of a floating
  // circle beside the card), so the card spans the full row width. Tiles that name
  // their own placard have no ordinal to show — position means nothing to them.
  const slotBadge = namesItsPlacard ? null : (
    <span className="absolute top-0 left-0 min-w-5 h-5 px-1 flex items-center justify-center rounded-br-lg bg-black/70 text-[10px] font-bold text-white tabular-nums pointer-events-none">
      {index + 1}
    </span>
  );

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${missing ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-3 p-3">
        {/* Reorder arrows sit inline on desktop; on mobile they move into the
            action bar below, where they get real touch targets. */}
        {!namesItsPlacard && (
          <div className="hidden sm:flex flex-col">
            <button onClick={() => onMove(-1)} disabled={index === 0} className="text-gray-400 hover:text-gray-900 disabled:opacity-25"><ArrowUp className="w-4 h-4" /></button>
            <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-gray-400 hover:text-gray-900 disabled:opacity-25"><ArrowDown className="w-4 h-4" /></button>
          </div>
        )}

        {isProduct && item.product ? (
          <button
            onClick={() => onQuickView(item.product as ResolvedProductItem)}
            title="Quick view"
            className="group/qv relative w-20 h-20 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-gray-200 shrink-0"
          >
            {img ? <img src={img} alt={title} className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-gray-300" />}
            <span className="absolute inset-0 bg-black/0 group-hover/qv:bg-black/30 transition-colors" />
            <span className="absolute bottom-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/55 group-hover/qv:bg-black/80 transition-colors">
              <Eye className="w-3 h-3 text-white" />
            </span>
            {slotBadge}
          </button>
        ) : (
          <div className="relative w-20 h-20 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-gray-200 shrink-0 flex items-center justify-center">
            {img ? <img src={img} alt={title} className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-gray-300" />}
            {slotBadge}
            {hasDesktopImage && (
              <span
                title="Has a separate desktop image"
                className="absolute bottom-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-md bg-black/55 text-white pointer-events-none"
              >
                <Monitor className="w-3 h-3" />
              </span>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Mobile reads top-down: title, subtitle, then the meta chips on their own
              row. From sm: up the chips sit inline after the title as before. */}
          <div className="flex items-center gap-2 min-w-0">
            <p className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">{title}</p>
            <span className={`hidden sm:inline-flex justify-center w-16 ${kindChip}`}>{isProduct ? "Product" : "Tile"}</span>
            {showBadge && item.badge && <span className={`hidden sm:inline-flex ${badgeChip}`}>{item.badge}</span>}
          </div>
          {(missing || sub || (isProduct && item.product)) && (
            <div className="flex items-baseline justify-between gap-2 mt-0.5 min-w-0">
              <p className="text-xs text-gray-500 truncate">{missing ? "⚠ Product no longer published — will be skipped" : sub}</p>
              {isProduct && item.product && (
                <span className="shrink-0 text-sm font-bold text-teal-700 tabular-nums">₹{item.product.price}</span>
              )}
            </div>
          )}
        </div>

        <div className="hidden sm:flex items-center">
          {!isProduct && (
            <button onClick={onEdit} className="text-gray-400 hover:text-gray-900 p-1.5"><Pencil className="w-4 h-4" /></button>
          )}
          <button onClick={onRemove} className="text-gray-400 hover:text-red-600 p-1.5"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Mobile action bar: the kind/badge chips sit on the left, the grouped
          controls on the right — one row for everything below the text. The reorder
          pair only renders when there's actually something to reorder, so a
          single-item section never shows a row of dead gray arrows. */}
      <div className={`flex sm:hidden items-center gap-2 px-3 py-2 border-t ${missing ? "border-red-200 bg-red-100/40" : "border-gray-100 bg-gray-50/70"}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`inline-flex justify-center w-20 ${kindChip}`}>{isProduct ? "Product" : "Tile"}</span>
          {showBadge && item.badge && <span className={badgeChip}>{item.badge}</span>}
        </div>
        <span className="flex-1" />
        {total > 1 && !namesItsPlacard && (
          <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
            <button onClick={() => onMove(-1)} disabled={index === 0} className="px-3.5 py-1.5 text-gray-600 active:bg-gray-100 disabled:opacity-25"><ArrowUp className="w-4 h-4" /></button>
            <span className="w-px self-stretch bg-gray-200" />
            <button onClick={() => onMove(1)} disabled={index === total - 1} className="px-3.5 py-1.5 text-gray-600 active:bg-gray-100 disabled:opacity-25"><ArrowDown className="w-4 h-4" /></button>
          </div>
        )}
        {!isProduct && (
          <button onClick={onEdit} className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm text-gray-600 active:bg-gray-100"><Pencil className="w-4 h-4" /></button>
        )}
        <button onClick={onRemove} className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm text-red-500 active:bg-red-50"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// True device viewports the preview iframe renders at. The frame is laid out at this
// exact size (so the components see a real desktop/phone viewport and render exactly
// as on the live site) and is then visually scaled down to fit the editor pane.
const PREVIEW_VIEWPORTS = {
  desktop: { w: 1024, h: 900 },
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
const SpotlightPage = () => {
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
  // `collection` is set when the tile was opened from a placard card, which has
  // already decided which collection it fronts — the modal then locks that choice
  // instead of offering the dropdown.
  const [tileEditing, setTileEditing] = useState<{ item: DraftItem | null; collection?: string } | null>(null);
  const [quickView, setQuickView] = useState<ResolvedProductItem | null>(null);
  const [headingEditing, setHeadingEditing] = useState(false);
  const [savingHeading, setSavingHeading] = useState(false);

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
      { type: "curation-preview-items", key: selected.key, items: previewItems, title: selected.title, subtitle: selected.subtitle },
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
        // Stored identity is the base_sku; p.sku carries the primary variant for
        // storefront actions and must NOT be persisted here.
        productBaseSku: p.baseSku,
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

  const saveHeading = async (section: AdminSection, patch: { title: string; subtitle: string }) => {
    setSavingHeading(true);
    try {
      const { updatedAt } = await updateSection(section.key, { title: patch.title, subtitle: patch.subtitle });
      setSections((prev) => prev.map((s) => (s.key === section.key
        ? { ...s, title: patch.title || null, subtitle: patch.subtitle || null, updatedAt: updatedAt ?? s.updatedAt }
        : s)));
      // Bump any open tab's version too, or its next save would 409 on this edit.
      if (updatedAt) {
        setTabs((prev) => (prev[section.key] ? { ...prev, [section.key]: { ...prev[section.key], updatedAt } } : prev));
      }
      toast.success("Heading updated");
      setHeadingEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingHeading(false);
    }
  };

  if (authLoading) {
    return <RouteFallback />;
  }

  const canAddProduct = selected && (selected.itemType === "product" || selected.itemType === "mixed");
  const canAddTile = selected
    && (selected.itemType === "editorial" || selected.itemType === "mixed")
    && !PRODUCTS_ONLY.has(selected.key);

  // Sections whose tiles name their own placard are edited as a fixed grid of
  // placard cards (PlacardGrid) rather than an add-and-reorder item list.
  const namesItsPlacard = !!selected && IMAGE_AND_LINK_ONLY.has(selected.key);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      {user ? <UserNavbar /> : <Navbar />}

      {/* Header */}
      <div className="relative pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)] bg-white pb-0">
        <div className="max-w-screen-2xl mx-auto px-3 lg:px-6">
          <div className="pt-3 pb-2 mt-1.5 mb-1">
            <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
              <Link to="/" className="hover:underline">
                Home
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-800 font-medium">The Spotlight</span>
            </div>
          </div>
          <div className="space-y-1 mb-8">
            <div className="flex items-center">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>Merchandising</p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">The Spotlight</h1>
            <p className="text-sm text-gray-500">Control which products and tiles appear across the storefront.</p>
          </div>
          <hr className="-mx-3 lg:-mx-6 h-1 border-0 bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400" />
        </div>
      </div>

      <main className="flex-1 px-3 lg:px-6 pb-8 pt-0">
        <div className="max-w-screen-2xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24 mt-8 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : error ? (
            <div className="w-full py-20 mt-8 flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl">
              <PackageX size={44} className="text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-800 mb-1">Couldn't load sections</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
              {/* ── Sidebar: page groups → sections ── */}
              <aside className="lg:border-r border-foreground/50 lg:pr-6 pt-8 -ml-3 lg:-ml-6">
                {/* One overall border wraps every page group; groups sit inside with a
                    small gap (and their own rounding) instead of each having its own border. */}
                <div className="rounded-xl border border-foreground/50 shadow-sm bg-white p-2 space-y-2">
                {SECTION_GROUPS.map((group) => {
                  const groupSections = group.keys
                    .map((k) => sections.find((s) => s.key === k))
                    .filter((s): s is AdminSection => !!s);
                  if (groupSections.length === 0) return null;
                  const isOpen = openGroups.has(group.label);
                  const GroupIcon = group.icon;
                  return (
                    <div key={group.label} className="rounded-lg overflow-hidden">
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
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white text-[11px] font-bold text-black tabular-nums">{groupSections.length}</span>
                          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </div>
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
                                  className={`flex-1 min-w-0 text-left p-3 rounded-lg border border-foreground/50 transition-all ${active ? "border-[1.5px] border-gray-600 bg-white shadow-sm" : "bg-gray-50 hover:bg-gray-100"}`}
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
                </div>
              </aside>

              {/* ── Editor ── */}
              <section className="min-w-0 pt-8">
                {/* Chrome-style tab strip for the open sections */}
                {openTabs.length > 0 && (
                  <div className="flex items-end gap-2 -mb-[1.5px] relative z-10">
                    <div className="flex items-end gap-[2px] overflow-x-auto no-scrollbar flex-1 min-w-0">
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
                          className={`group/tab relative flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 rounded-t-sm border border-foreground/50 cursor-pointer whitespace-nowrap transition-colors max-w-[180px] ${isActive ? "border-[1.5px] border-gray-600 bg-white z-10" : "bg-gray-100/70 hover:bg-gray-100 z-0 bg-clip-padding border-b-[1.5px] border-b-transparent"}`}
                          style={isActive ? { borderBottomColor: "white" } : {}}
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
                    </div>
                    {openTabs.length > 1 && (
                      <button
                        onClick={closeAllTabs}
                        className="shrink-0 mb-1 text-xs font-semibold text-red-500 hover:text-red-600 px-2 py-1 rounded transition-colors whitespace-nowrap"
                      >
                        Close all
                      </button>
                    )}
                  </div>
                )}
                {!selected ? (
                  <div className="py-20 text-center text-gray-400">Select a section from the sidebar to open it in a tab.</div>
                ) : (
                  <div className="border-[1.5px] border-gray-600 rounded-2xl rounded-tl-none bg-white shadow-md overflow-hidden">
                    {/* Editor header */}
                    <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-100">
                      <div className="min-w-0 flex-1">
                        <h2 className="font-display text-2xl font-black text-foreground truncate">{selected.title}</h2>
                        <p className="text-xs text-gray-500">
                          {selected.itemType === "product" && "Holds catalog products. Empty = random products shown automatically."}
                          {selected.itemType === "editorial" && (IMAGE_AND_LINK_ONLY.has(selected.key)
                            ? "One card per collection. Click a card to set that placard's picture and where it points — everything else is fixed on the page."
                            : "Holds custom image/title/link tiles.")}
                          {/* Deliberately not the product-section wording: a mixed section
                              is NOT topped up when partly curated (see resolveItems in
                              backend/routes/curation), so promising a fill would be wrong. */}
                          {selected.itemType === "mixed" && (PRODUCTS_ONLY.has(selected.key)
                            ? "Holds catalog products. Empty = random products shown automatically; add any and only those show."
                            : "Holds products and/or custom tiles.")}
                          {/* The cap is the collection count here, which the grid already
                              makes obvious — restating it as a number reads like a quota. */}
                          {!namesItsPlacard && <>{" "}Max {selected.maxItems}.</>}
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
                      {/* Placard sections have nothing to add — every collection is
                          already on screen as a card, curated or not. */}
                      {canAddTile && !namesItsPlacard && (
                        <button
                          onClick={() => setTileEditing({ item: null })}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-400 rounded-md px-3 py-2 bg-white hover:border-gray-900"
                        >
                          <ImagePlus className="w-3.5 h-3.5" /> Add tile
                        </button>
                      )}
                      {!NO_SECTION_HEADING.has(selected.key) && (
                        <button
                          onClick={() => setHeadingEditing(true)}
                          title="Edit heading & subheading"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-400 rounded-md px-3 py-2 bg-white hover:border-gray-900"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit heading
                        </button>
                      )}
                      {draft.length > selected.maxItems && (
                        <span className="text-xs text-amber-600 ml-auto">Over the {selected.maxItems}-item cap — only the first {selected.maxItems} will show on the storefront.</span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="p-4 space-y-2 bg-gray-100">
                      {namesItsPlacard ? (
                        <PlacardGrid
                          draft={draft}
                          onEdit={(item, collection) => setTileEditing({ item, collection })}
                          onReset={(item) => updateActiveDraft((prev) => prev.filter((d) => d.tempId !== item.tempId))}
                        />
                      ) : draft.length === 0 ? (
                        <div className="py-14 text-center">
                          <p className="text-sm font-semibold text-gray-700 mb-1">No items yet</p>
                          <p className="text-xs text-gray-500">
                            {selected.itemType !== "editorial"
                              ? "Empty — the storefront will show random products automatically. Add products to curate."
                              : IMAGE_AND_LINK_ONLY.has(selected.key)
                                ? "Empty — every placard shows its own collection's newest product and opens that collection. Add tiles to override."
                                : "Add tiles to populate this section."}
                          </p>
                        </div>
                      ) : (
                        draft.map((item, i) => (
                          <ItemRow
                            key={item.tempId}
                            item={item}
                            index={i}
                            total={draft.length}
                            showBadge={selected.key !== "home_shop_the_look"}
                            showSubtitle={selected.key !== "home_shop_the_look"}
                            namesItsPlacard={namesItsPlacard}
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
                    <div className="mt-40 border-t-[1.5px] border-gray-600">
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
                      {/* Desktop preview is full-bleed: no side padding and no frame ring, so
                          it spans the whole pane width with no side margins. Mobile keeps the
                          phone bezel + surround (a 390px phone is centered by nature). */}
                      <div className={`bg-gray-100/60 ${previewDevice === "mobile" ? "p-3 sm:p-4" : ""}`}>
                        <div ref={previewWrapRef} className="flex justify-center">
                          {/* Sized box = scaled footprint; the iframe inside is laid out at
                              the true viewport size and transform-scaled to fit. The phone
                              bezel uses a ring (box-shadow) so it doesn't eat into the
                              viewport width. */}
                          <div
                            className={`overflow-hidden bg-white ${
                              previewDevice === "mobile"
                                ? "rounded-[1.75rem] ring-[6px] ring-gray-900 shadow-xl my-2"
                                : ""
                            }`}
                            style={{
                              width: PREVIEW_VIEWPORTS[previewDevice].w * previewScale,
                              height: PREVIEW_VIEWPORTS[previewDevice].h * previewScale,
                            }}
                          >
                            <iframe
                              ref={previewFrameRef}
                              src="/admin/spotlight/preview"
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
          // Everything claimed by another tile — the one being edited keeps its own
          // collection selectable, so re-saving it unchanged isn't blocked.
          takenCollections={
            new Set(
              draft
                .filter((d) => d.tempId !== tileEditing.item?.tempId)
                .map(tileCollection)
                .filter(Boolean),
            )
          }
          lockedCollection={tileEditing.collection}
          onClose={() => setTileEditing(null)}
          onSave={upsertTile}
        />
      )}

      {headingEditing && selected && (
        <SectionHeadingModal
          section={selected}
          saving={savingHeading}
          onClose={() => setHeadingEditing(false)}
          onSave={(patch) => void saveHeading(selected, patch)}
        />
      )}
    </div>
  );
};

export default SpotlightPage;
