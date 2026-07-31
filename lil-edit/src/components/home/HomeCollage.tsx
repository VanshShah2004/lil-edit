import { useEffect, useMemo, useRef, useState } from "react";
import { useCuratedSection, metaStr } from "@/hooks/useCuratedSection";
import type { ResolvedItem, ResolvedEditorialItem } from "@/lib/curationApi";
import img1 from "@/assets/collage/collage-main-mobile-01.jpg";
import img1Desktop from "@/assets/collage/collage-main-desktop-01.jpg";
import img2 from "@/assets/collage/collage-main-mobile-02.jpg";
import img2Desktop from "@/assets/collage/collage-main-desktop-02.png";
import img3 from "@/assets/collage/collage-main-mobile-03.jpg";
import img3Desktop from "@/assets/collage/collage-main-desktop-03.png";
import img4 from "@/assets/collage/collage-main-mobile-04.jpg";
import lec002 from "@/assets/collage/collage-slide-mobile-02.png";
import lec003 from "@/assets/collage/collage-slide-mobile-03.png";
import lecD002 from "@/assets/collage/collage-slide-desktop-02.png";
import lecD003 from "@/assets/collage/collage-slide-desktop-03.png";

const AUTO_SWIPE_MS = 4500;

// Bundled defaults for the full-bleed slides that follow the grid page. Admins
// curate up to MAX_EXTRA_SLIDES of them in the HeroSection+ section; these pad
// the carousel up to MIN_EXTRA_SLIDES pages when fewer are curated.
const EXTRA_SLIDE_DEFAULTS = [
  { mobile: lec002, desktop: lecD002 },
  { mobile: lec003, desktop: lecD003 },
];
const MIN_EXTRA_SLIDES = 2;
const MAX_EXTRA_SLIDES = 4;

const onlyEditorials = (items: ResolvedItem[]) =>
  items.filter((i): i is ResolvedEditorialItem => i.kind === "editorial");

// The carousel is fed by TWO curated sections: home_collage (the 4 grid photos)
// and home_hero_plus (the extra full-bleed swipe slides). The admin preview
// overrides them independently — whichever section is being previewed comes in
// via its prop while the other is still fetched live, so the iframe always
// shows the whole carousel in context.
const HomeCollage = ({
  previewItems,
  previewExtraItems,
}: {
  previewItems?: ResolvedItem[];
  previewExtraItems?: ResolvedItem[];
}) => {
  const gridPreview = previewItems !== undefined;
  const extrasPreview = previewExtraItems !== undefined;
  const [activePart, setActivePart] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const { editorials: fetchedEditorials } = useCuratedSection("home_collage", { skip: gridPreview });
  const { editorials: fetchedExtras } = useCuratedSection("home_hero_plus", { skip: extrasPreview });
  const editorials = gridPreview ? onlyEditorials(previewItems) : fetchedEditorials;
  const extraEditorials = extrasPreview ? onlyEditorials(previewExtraItems) : fetchedExtras;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const parts = useMemo(() => {
    // Each image slot maps to a curated editorial item (in order). The two
    // breakpoints are independent: mobile uses the item's image
    // (custom_image_url), desktop uses meta.desktop_image_url, and whichever a
    // breakpoint lacks falls back to its OWN bundled default — so uploading just
    // one of the two leaves the other showing the default (not the uploaded one).
    const slot = (it: ResolvedEditorialItem | undefined, mob: string, desk: string) => ({
      mobile: it?.image || mob,
      desktop: metaStr(it?.meta, "desktop_image_url") || desk,
    });
    const s0 = slot(editorials[0], img1, img1Desktop);
    const s1 = slot(editorials[1], img2, img2Desktop);
    const s2 = slot(editorials[2], img3, img3Desktop);
    const s3 = slot(editorials[3], img4, img4);

    // Each HeroSection+ item becomes its own full-bleed swipe page. Curated
    // count wins (up to MAX_EXTRA_SLIDES); bundled defaults pad up to
    // MIN_EXTRA_SLIDES so the carousel never drops below its original 3 pages.
    const extraCount = Math.min(
      Math.max(extraEditorials.length, MIN_EXTRA_SLIDES),
      MAX_EXTRA_SLIDES,
    );
    const extraParts = Array.from({ length: extraCount }, (_, i) => {
      const fallback = EXTRA_SLIDE_DEFAULTS[i % EXTRA_SLIDE_DEFAULTS.length];
      const s = slot(extraEditorials[i], fallback.mobile, fallback.desktop);
      return (
        <div key={`part-extra-${i}`} className="w-full h-full px-2 md:px-0">
          <div className="w-full h-full overflow-hidden rounded-none">
            <img
              src={isDesktop ? s.desktop : s.mobile}
              alt={`Collage slide ${i + 2}`}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      );
    });

    return [
      <div key="part-collage" className="w-full h-full grid grid-cols-7 md:grid-cols-5 grid-rows-2 gap-2 md:gap-1.5 px-2 sm:px-4">
        <div className="col-span-3 md:col-span-2 row-span-1 overflow-hidden rounded-none">
          <img
            src={s0.mobile}
            alt="Collage 1 Mobile"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-in-out md:hidden"
          />
          <img
            src={s0.desktop}
            alt="Collage 1 Desktop"
            className="w-full h-full object-cover object-top hover:scale-105 transition-transform duration-700 ease-in-out hidden md:block"
          />
        </div>
        <div className="col-span-4 md:col-span-3 row-span-1 overflow-hidden rounded-none">
          <img
            src={s1.mobile}
            alt="Collage 2 Mobile"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-in-out md:hidden"
          />
          <img
            src={s1.desktop}
            alt="Collage 2 Desktop"
            className="w-full h-full object-cover object-[50%_35%] hover:scale-105 transition-transform duration-700 ease-in-out hidden md:block"
          />
        </div>
        <div className="col-span-4 md:col-span-3 row-span-1 overflow-hidden rounded-none">
          <img
            src={s2.mobile}
            alt="Collage 3 Mobile"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-in-out md:hidden"
          />
          <img
            src={s2.desktop}
            alt="Collage 3 Desktop"
            className="w-full h-full object-cover object-[50%_55%] hover:scale-105 transition-transform duration-700 ease-in-out hidden md:block"
          />
        </div>
        <div className="col-span-3 md:col-span-2 row-span-1 overflow-hidden rounded-none">
          <img
            src={isDesktop ? s3.desktop : s3.mobile}
            alt="Collage 4"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-in-out"
          />
        </div>
      </div>,
      ...extraParts,
    ];
  }, [isDesktop, editorials, extraEditorials]);

  // parts.length can shrink live (admin preview removes tiles), so clamp the
  // rendered index rather than trusting activePart to stay in range.
  const currentPart = Math.min(activePart, parts.length - 1);

  useEffect(() => {
    const currentSlideDelay = currentPart === 0 ? AUTO_SWIPE_MS * 2 : AUTO_SWIPE_MS;
    const timer = window.setTimeout(() => {
      setActivePart((currentPart + 1) % parts.length);
    }, currentSlideDelay);
    return () => window.clearTimeout(timer);
  }, [currentPart, parts.length]);

  const goNext = () => setActivePart((currentPart + 1) % parts.length);
  const goPrev = () => setActivePart((currentPart - 1 + parts.length) % parts.length);

  return (
    <section
      className="w-full mt-[10px] mb-4 relative"
      style={{ overflowX: "clip" }}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
        touchDeltaX.current = 0;
      }}
      onTouchMove={(e) => {
        if (touchStartX.current == null) return;
        touchDeltaX.current = (e.touches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
      }}
      onTouchEnd={() => {
        if (touchStartX.current == null) return;
        const threshold = 45;
        if (touchDeltaX.current <= -threshold) goNext();
        else if (touchDeltaX.current >= threshold) goPrev();
        touchStartX.current = null;
        touchDeltaX.current = 0;
      }}
    >
      {/* Side Accents (White Rectangles with Design) - Tailored Desktop Profile */}
      <div className="flex absolute left-[1vw] sm:left-[2vw] lg:left-[4.5vw] xl:left-[4vw] top-1/2 -translate-y-1/2 w-6 sm:w-14 lg:w-10 xl:w-12 h-[380px] sm:h-[450px] lg:h-[520px] bg-white shadow-xl z-20 pointer-events-none border border-white/50 rounded-lg sm:rounded-2xl overflow-hidden flex-col items-center py-4 sm:py-8">
        {/* Top decorative line/dots */}
        <div className="flex-1 flex flex-col items-center gap-1.5 w-full">
          <div className="w-0.5 sm:w-1 flex-1 bg-[#0B5B55]/60 rounded-full" />
          <div className="w-1.5 sm:w-2.5 h-1.5 sm:h-2.5 rounded-full bg-[#0B5B55]" />
        </div>

        <p className="my-4 sm:my-8 text-[10px] sm:text-[12px] xl:text-[14px] font-black tracking-[0.3em] sm:tracking-[0.4em] uppercase text-foreground rotate-180 [writing-mode:vertical-lr] whitespace-nowrap">
          Curated With Love
        </p>

        {/* Bottom decorative line/dots */}
        <div className="flex-1 flex flex-col items-center gap-1.5 w-full">
          <div className="w-1.5 sm:w-2.5 h-1.5 sm:h-2.5 rounded-full bg-[#0B5B55]" />
          <div className="w-0.5 sm:w-1 flex-1 bg-[#0B5B55]/60 rounded-full" />
        </div>
      </div>

      <div className="flex absolute right-[1vw] sm:right-[2vw] lg:right-[4.5vw] xl:right-[4vw] top-1/2 -translate-y-1/2 w-6 sm:w-14 lg:w-10 xl:w-12 h-[380px] sm:h-[450px] lg:h-[520px] bg-white shadow-2xl z-20 pointer-events-none border border-white/50 rounded-lg sm:rounded-2xl overflow-hidden flex-col items-center py-4 sm:py-8">
        {/* Top decorative line/dots */}
        <div className="flex-1 flex flex-col items-center gap-1.5 w-full">
          <div className="w-0.5 sm:w-1 flex-1 bg-[#0B5B55]/60 rounded-full" />
          <div className="w-1.5 sm:w-2.5 h-1.5 sm:h-2.5 rounded-full bg-[#0B5B55]" />
        </div>

        <p className="my-4 sm:my-8 text-[10px] sm:text-[12px] xl:text-[14px] font-black tracking-[0.3em] sm:tracking-[0.4em] uppercase text-foreground [writing-mode:vertical-lr] whitespace-nowrap">
          New Season 2026

        </p>

        {/* Bottom decorative line/dots */}
        <div className="flex-1 flex flex-col items-center gap-1.5 w-full">
          <div className="w-1.5 sm:w-2.5 h-1.5 sm:h-2.5 rounded-full bg-[#0B5B55]" />
          <div className="w-0.5 sm:w-1 flex-1 bg-[#0B5B55]/60 rounded-full" />
        </div>
      </div>

      <div className="relative -top-[15px] md:-top-[20px] mx-auto w-[94%] sm:w-[88%] lg:w-[80%] h-[620px] md:h-[600px] lg:h-[560px] overflow-hidden">
        <div
          className="w-full h-full flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentPart * 100}%)` }}
        >
          {parts.map((part, idx) => (
            <div key={`part-${idx}`} className="w-full h-full shrink-0">
              {part}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-center gap-2">
        {parts.map((_, idx) => (
          <button
            key={`dot-${idx}`}
            onClick={() => setActivePart(idx)}
            className={`h-2.5 rounded-full transition-all ${currentPart === idx ? "w-6 bg-[#0F766E]" : "w-2.5 bg-gray-300"}`}
            aria-label={`Go to collage part ${idx + 1}`}
          />
        ))}
      </div>
    </section>
  );
};

export default HomeCollage;
