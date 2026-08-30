import { useEffect, useState, type JSX } from "react";

import TrendingSection from "@/components/home/TrendingSection";
import RecommendedForYou from "@/components/home/RecommendedForYou";
import ShopTheLook from "@/components/home/ShopTheLook";
import FeaturedCategories from "@/components/home/FeaturedCategories";
import HomeCollage from "@/components/home/HomeCollage";
import FrequentSearches from "@/components/search/FrequentSearches";
import CollageGrid from "@/components/search/CollageGrid";
import BrowseCollections from "@/components/collections/BrowseCollections";
import CommunityGallery from "@/components/collections/CommunityGallery";
import { SECTION_KEYS, type ResolvedItem, type SectionKey } from "@/lib/curationApi";

// ─────────────────────────────────────────────────────────────────────────────
// Standalone live-preview document, loaded in an <iframe> by the Curation Studio.
// Because it is its own browsing context, the iframe's width IS the viewport the
// components see — so Tailwind's responsive breakpoints behave exactly like a real
// phone/desktop instead of inheriting the editor window's width (which squeezed
// desktop layouts into the pane and clipped them).
//
// The editor drives it over postMessage:
//   child → parent  { type: "curation-preview-ready" }            (on mount)
//   parent → child  { type: "curation-preview-items", key, items } (on every draft change)
// ─────────────────────────────────────────────────────────────────────────────

// Background each section sits on in its real host page, so the preview shows it on
// the same canvas: Home strips sit on the lavender main (Home.tsx bg-[#E8DDF7]), the
// search sections live in the bg-background drawer (SearchPanel.tsx), and the
// Collections featured grid is on the white Collections page.
const PREVIEW_BACKGROUNDS: Record<SectionKey, string> = {
  home_trending: "bg-[#E8DDF7]",
  home_recommended: "bg-[#E8DDF7]",
  search_popular: "bg-background",
  search_discover: "bg-background",
  home_shop_the_look: "bg-[#E8DDF7]",
  home_featured_categories: "bg-[#E8DDF7]",
  home_collage: "bg-[#E8DDF7]",
  home_hero_plus: "bg-[#E8DDF7]",
  collections_browse: "bg-white",
  collections_gallery: "bg-white",
};

// One real storefront component per section, fed the draft items as previewItems.
// title/subtitle come straight from the admin section record (edited via "Edit
// heading"), not the draft — sections with no heading UI just ignore them.
const PREVIEW_RENDERERS: Record<SectionKey, (items: ResolvedItem[], title: string | null, subtitle: string | null) => JSX.Element> = {
  home_trending: (items, title, subtitle) => <TrendingSection previewItems={items} previewTitle={title} previewSubtitle={subtitle} />,
  home_recommended: (items, title, subtitle) => <RecommendedForYou previewItems={items} previewTitle={title} previewSubtitle={subtitle} />,
  search_popular: (items, title, subtitle) => <FrequentSearches previewItems={items} previewTitle={title} previewSubtitle={subtitle} onSelect={() => {}} />,
  search_discover: (items, title) => <CollageGrid previewItems={items} previewTitle={title} />,
  home_shop_the_look: (items, title, subtitle) => <ShopTheLook previewItems={items} previewTitle={title} previewSubtitle={subtitle} />,
  home_featured_categories: (items) => <FeaturedCategories previewItems={items} />,
  home_collage: (items) => <HomeCollage previewItems={items} />,
  // HeroSection+ previews only override the extra swipe slides — the grid page
  // is still fetched live so the admin sees the whole carousel in context.
  home_hero_plus: (items) => <HomeCollage previewExtraItems={items} />,
  // Only the curated picks and the section heading are overridden here — the
  // per-collection fallback products and style counts still load live, so the pane
  // shows the strip in context. A placard's sub-heading and picture preview through
  // the draft items; either one left unset falls back to what SUB_COLLECTIONS ships,
  // exactly as on the page. The placard's name and route stay fixed in code, so those
  // are not previewable.
  collections_browse: (items, title, subtitle) => <BrowseCollections previewItems={items} previewTitle={title} previewSubtitle={subtitle} />,
  // An empty draft previews the same real-product fill the live page gets, and a
  // draft with photo tiles previews those — previewSection resolves both through
  // the very same backend path, so the pane and the page cannot disagree.
  collections_gallery: (items, title, subtitle) => <CommunityGallery previewItems={items} previewTitle={title} previewSubtitle={subtitle} />,
};

// The column a section sits inside on its real page. Most strips carry their own
// container and padding (ShopTheLook's `container px-4`, TrendingSection's, …), so
// they render full-bleed here and look right. BrowseCollections has none of its own
// — on the Collections page it inherits the wrapper at Collections.tsx:167-168 — so
// without this it runs edge-to-edge in the pane at every width. Reproduce the host
// column exactly: responsive side padding on the outer div, the max-width cap on the
// inner one, matching the real page's mobile AND desktop gutters.
const PREVIEW_WRAPPERS: Partial<Record<SectionKey, { outer: string; inner: string }>> = {
  collections_browse: { outer: "px-4 sm:px-8 md:px-12 lg:px-16", inner: "max-w-5xl mx-auto" },
  collections_gallery: { outer: "px-4 sm:px-8 md:px-12 lg:px-16", inner: "max-w-5xl mx-auto" },
};

interface PreviewState {
  key: SectionKey;
  items: ResolvedItem[];
  title: string | null;
  subtitle: string | null;
}

const SpotlightPreviewPage = () => {
  const [state, setState] = useState<PreviewState | null>(null);

  useEffect(() => {
    // The app stylesheet reserves a permanent scrollbar gutter on <html> (layout-shift
    // guard for the real site, index.css). In this iframe the colored inner div is the
    // scroll container, so the document's reserved gutter would only ever paint as a
    // white strip beside the section background — drop it for this document only.
    document.documentElement.style.scrollbarGutter = "auto";

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; key?: string; items?: ResolvedItem[]; title?: string | null; subtitle?: string | null } | null;
      if (!data || data.type !== "curation-preview-items") return;
      if (!data.key || !(SECTION_KEYS as readonly string[]).includes(data.key)) return;
      console.log(`[CurationPreview] received ${data.key} — ${(data.items ?? []).length} item(s)`);
      setState({ key: data.key as SectionKey, items: data.items ?? [], title: data.title ?? null, subtitle: data.subtitle ?? null });
    };
    window.addEventListener("message", onMessage);
    // Tell the editor this frame is mounted and ready to receive items.
    window.parent.postMessage({ type: "curation-preview-ready" }, window.location.origin);
    console.log("[CurationPreview] ready — waiting for items");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Render the section whole, then re-create its host page's column when it has one.
  // Sections with no entry in PREVIEW_WRAPPERS stay full-bleed, exactly as before.
  const wrapper = state ? PREVIEW_WRAPPERS[state.key] : undefined;
  const section = state ? PREVIEW_RENDERERS[state.key](state.items, state.title, state.subtitle) : null;

  return (
    // h-screen + internal scroll (scrollbar hidden): if the document itself scrolled,
    // the iframe would paint its own scrollbar track as a white strip over the
    // section background.
    // font-body (DM Sans) — NOT font-sans. The storefront <body> is font-body and the
    // host pages (Home wrapper, search panel, Collections) inherit it, so every section's
    // non-heading text is DM Sans there. font-sans resolves to Tailwind's default system
    // stack (the config never redefines `sans`), which would render eyebrows/labels/buttons
    // in the OS font and break parity with the live page. Headings stay Playfair via their
    // explicit font-display + the h1–h6 base-layer rule, inherited from the same index.css.
    <div className={`h-screen overflow-y-auto overflow-x-hidden no-scrollbar font-body text-[#1a1a1a] ${state ? PREVIEW_BACKGROUNDS[state.key] : "bg-white"}`}>
      {/* pt-16 absorbs the negative top margins some strips use to overlap their
          predecessor on the real page (e.g. RecommendedForYou's -mt-14), which would
          otherwise be clipped at the top of this standalone document. Clicks are
          captured so previewing never navigates or mutates wishlist/cart state. */}
      <div className="pt-16 pb-10" onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        {section === null ? (
          <div className="py-24 text-center text-sm text-gray-400">Loading preview…</div>
        ) : wrapper ? (
          <div className={wrapper.outer}>
            <div className={wrapper.inner}>{section}</div>
          </div>
        ) : (
          section
        )}
      </div>
    </div>
  );
};

export default SpotlightPreviewPage;
