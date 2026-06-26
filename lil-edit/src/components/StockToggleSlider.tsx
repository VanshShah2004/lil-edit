import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface StockToggleSliderProps {
  isUnlimited: boolean;
  onChange: (unlimited: boolean) => void;
  /** Extra classes for the outer track (height / width etc.) */
  className?: string;
}

/**
 * A draggable two-position slider for the Limited / Unlimited stock mode.
 *
 * Three stacked layers:
 *  - transparent click targets (bottom) so tapping a half snaps to it
 *  - the white draggable thumb (middle) that the user can drag between halves
 *  - the label text (top, non-interactive) so it stays readable over the thumb
 *
 * On drag end the thumb snaps to whichever side it is closest to.
 */
export default function StockToggleSlider({
  isUnlimited,
  onChange,
  className = "",
}: StockToggleSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);

  // Measure how far the thumb travels (half the track, minus the 4px padding).
  useEffect(() => {
    const measure = () => {
      const w = trackRef.current?.offsetWidth ?? 0;
      setTravel(Math.max(0, w / 2 - 4));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div
      ref={trackRef}
      className={`relative flex p-1 bg-gray-100 rounded-md border border-gray-300 select-none touch-none ${className}`}
    >
      {/* Bottom layer: transparent click targets */}
      <button
        type="button"
        onClick={() => onChange(false)}
        className="flex-1 z-10 rounded-sm"
        aria-label="Limited"
      />
      <button
        type="button"
        onClick={() => onChange(true)}
        className="flex-1 z-10 rounded-sm"
        aria-label="Unlimited"
      />

      {/* Middle layer: draggable thumb */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: travel }}
        dragElastic={0.04}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          const current = isUnlimited ? travel : 0;
          const next = current + info.offset.x;
          onChange(next > travel / 2);
        }}
        animate={{ x: isUnlimited ? travel : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        className="absolute top-1 bottom-1 left-1 z-20 rounded-sm bg-white shadow-md border border-gray-200 cursor-grab active:cursor-grabbing"
        style={{ width: "calc(50% - 4px)" }}
      />

      {/* Top layer: labels (non-interactive so they never block the drag) */}
      <div className="absolute inset-0 z-30 flex pointer-events-none">
        <span
          className={`flex-1 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 ${
            !isUnlimited ? "text-gray-900" : "text-gray-500"
          }`}
        >
          Limited
        </span>
        <span
          className={`flex-1 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 ${
            isUnlimited ? "text-gray-900" : "text-gray-500"
          }`}
        >
          Unlimited
        </span>
      </div>
    </div>
  );
}
