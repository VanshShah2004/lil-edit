import { useEffect, useMemo, useRef, useState } from "react";
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

const HomeCollage = () => {
  const [activePart, setActivePart] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const parts = useMemo(() => {
    const secondImage = isDesktop ? lecD002 : lec002;
    const thirdImage = isDesktop ? lecD003 : lec003;
    return [
      <div key="part-collage" className="w-full h-full grid grid-cols-7 md:grid-cols-5 grid-rows-2 gap-2 sm:gap-4 px-2 sm:px-4">
        <div className="col-span-3 md:col-span-2 row-span-1 overflow-hidden rounded-xl md:rounded-none">
          <img
            src={img1}
            alt="Collage 1 Mobile"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-in-out md:hidden"
          />
          <img
            src={img1Desktop}
            alt="Collage 1 Desktop"
            className="w-full h-full object-cover object-top hover:scale-105 transition-transform duration-700 ease-in-out hidden md:block"
          />
        </div>
        <div className="col-span-4 md:col-span-3 row-span-1 overflow-hidden rounded-xl md:rounded-none">
          <img
            src={img2}
            alt="Collage 2 Mobile"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-in-out md:hidden"
          />
          <img
            src={img2Desktop}
            alt="Collage 2 Desktop"
            className="w-full h-full object-cover object-[50%_35%] hover:scale-105 transition-transform duration-700 ease-in-out hidden md:block"
          />
        </div>
        <div className="col-span-4 md:col-span-3 row-span-1 overflow-hidden rounded-xl md:rounded-none">
          <img
            src={img3}
            alt="Collage 3 Mobile"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-in-out md:hidden"
          />
          <img
            src={img3Desktop}
            alt="Collage 3 Desktop"
            className="w-full h-full object-cover object-[50%_55%] hover:scale-105 transition-transform duration-700 ease-in-out hidden md:block"
          />
        </div>
        <div className="col-span-3 md:col-span-2 row-span-1 overflow-hidden rounded-xl md:rounded-none">
          <img
            src={img4}
            alt="Collage 4"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-in-out"
          />
        </div>
      </div>,
      <div key="part-lec-2" className="w-full h-full px-2 md:px-0">
        <div className="w-full h-full overflow-hidden rounded-xl md:rounded-none">
          <img
            src={secondImage}
            alt={isDesktop ? "Lec D 002" : "Lec 002"}
            className="w-full h-full object-cover"
          />
        </div>
      </div>,
      <div key="part-lec-3" className="w-full h-full px-2 md:px-0">
        <div className="w-full h-full overflow-hidden rounded-xl md:rounded-none">
          <img
            src={thirdImage}
            alt={isDesktop ? "Lec D 003" : "Lec 003"}
            className="w-full h-full object-cover"
          />
        </div>
      </div>,
    ];
  }, [isDesktop]);

  useEffect(() => {
    const currentSlideDelay = activePart === 0 ? AUTO_SWIPE_MS * 2 : AUTO_SWIPE_MS;
    const timer = window.setTimeout(() => {
      setActivePart((prev) => (prev + 1) % parts.length);
    }, currentSlideDelay);
    return () => window.clearTimeout(timer);
  }, [activePart, parts.length]);

  const goNext = () => setActivePart((prev) => (prev + 1) % parts.length);
  const goPrev = () => setActivePart((prev) => (prev - 1 + parts.length) % parts.length);

  return (
    <section
      className="w-full mt-[10px] mb-8"
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
      <div className="relative -top-[25px] mx-auto w-[92%] sm:w-[90%] lg:w-[84%] h-[620px] md:h-[600px] lg:h-[560px] overflow-hidden">
        <div
          className="w-full h-full flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${activePart * 100}%)` }}
        >
          {parts.map((part, idx) => (
            <div key={`part-${idx}`} className="w-full h-full shrink-0">
              {part}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {parts.map((_, idx) => (
          <button
            key={`dot-${idx}`}
            onClick={() => setActivePart(idx)}
            className={`h-2.5 rounded-full transition-all ${activePart === idx ? "w-6 bg-[#0F766E]" : "w-2.5 bg-gray-300"}`}
            aria-label={`Go to collage part ${idx + 1}`}
          />
        ))}
      </div>
    </section>
  );
};

export default HomeCollage;
