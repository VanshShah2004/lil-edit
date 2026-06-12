import { useEffect, useState, type JSX } from "react";

import TrendingSection from "@/components/home/TrendingSection";
import RecommendedForYou from "@/components/home/RecommendedForYou";
import ShopTheLook from "@/components/home/ShopTheLook";
import FeaturedCategories from "@/components/home/FeaturedCategories";
import HomeCollage from "@/components/home/HomeCollage";
import FrequentSearches from "@/components/search/FrequentSearches";
import CollageGrid from "@/components/search/CollageGrid";
import FeaturedCollectionsGrid from "@/components/collections/FeaturedCollectionsGrid";
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
  collections_featured: "bg-white",
};

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

interface PreviewState {
  key: SectionKey;
  items: ResolvedItem[];
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
      const data = e.data as { type?: string; key?: string; items?: ResolvedItem[] } | null;
      if (!data || data.type !== "curation-preview-items") return;
      if (!data.key || !(SECTION_KEYS as readonly string[]).includes(data.key)) return;
      console.log(`[CurationPreview] received ${data.key} — ${(data.items ?? []).length} item(s)`);
      setState({ key: data.key as SectionKey, items: data.items ?? [] });
    };
    window.addEventListener("message", onMessage);
    // Tell the editor this frame is mounted and ready to receive items.
    window.parent.postMessage({ type: "curation-preview-ready" }, window.location.origin);
    console.log("[CurationPreview] ready — waiting for items");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    // h-screen + internal scroll (scrollbar hidden): if the document itself scrolled,
    // the iframe would paint its own scrollbar track as a white strip over the
    // section background.
    <div className={`h-screen overflow-y-auto overflow-x-hidden no-scrollbar font-sans text-[#1a1a1a] ${state ? PREVIEW_BACKGROUNDS[state.key] : "bg-white"}`}>
      {/* pt-16 absorbs the negative top margins some strips use to overlap their
          predecessor on the real page (e.g. RecommendedForYou's -mt-14), which would
          otherwise be clipped at the top of this standalone document. Clicks are
          captured so previewing never navigates or mutates wishlist/cart state. */}
      <div className="pt-16 pb-10" onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        {state ? (
          PREVIEW_RENDERERS[state.key](state.items)
        ) : (
          <div className="py-24 text-center text-sm text-gray-400">Loading preview…</div>
        )}
      </div>
    </div>
  );
};

export default SpotlightPreviewPage;
