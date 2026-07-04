import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export type ReviewFilter = "all" | "verified" | "unverified";

interface ReviewFilterSliderProps {
  value: ReviewFilter;
  onChange: (value: ReviewFilter) => void;
  className?: string;
}

const OPTIONS: { value: ReviewFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Unverified" },
];

/**
 * A draggable three-position slider (All / Verified / Unverified), mirroring
 * StockToggleSlider's drag mechanics but generalized to N equal segments.
 */
export default function ReviewFilterSlider({ value, onChange, className = "" }: ReviewFilterSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);

  const activeIndex = OPTIONS.findIndex((o) => o.value === value);

  useEffect(() => {
    const measure = () => {
      const w = trackRef.current?.offsetWidth ?? 0;
      // Distance the thumb travels between the first and last segment (2 gaps of
      // one segment-width each), minus the 4px inner padding on each side.
      setTravel(Math.max(0, (w * (OPTIONS.length - 1)) / OPTIONS.length - 4));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const segmentTravel = travel / (OPTIONS.length - 1);

  return (
    <div
      ref={trackRef}
      className={`relative flex p-1 bg-gray-100 rounded-md border border-gray-300 select-none touch-none ${className}`}
    >
      {/* Bottom layer: transparent click targets */}
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="flex-1 z-10 rounded-sm"
          aria-label={opt.label}
        />
      ))}

      {/* Middle layer: draggable thumb */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: travel }}
        dragElastic={0.04}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          const current = activeIndex * segmentTravel;
          const next = current + info.offset.x;
          const nearest = Math.round(next / segmentTravel);
          const clamped = Math.min(OPTIONS.length - 1, Math.max(0, nearest));
          onChange(OPTIONS[clamped].value);
        }}
        animate={{ x: activeIndex * segmentTravel }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        className="absolute top-1 bottom-1 left-1 z-20 rounded-sm shadow-md cursor-grab active:cursor-grabbing"
        style={{
          width: `calc(${100 / OPTIONS.length}% - 4px)`,
          background: "linear-gradient(135deg, #B19CD9, #9A82C9)",
        }}
      />

      {/* Top layer: labels (non-interactive so they never block the drag) */}
      <div className="absolute inset-0 z-30 flex pointer-events-none">
        {OPTIONS.map((opt) => (
          <span
            key={opt.value}
            className={`flex-1 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 ${
              value === opt.value ? "text-white" : "text-gray-500"
            }`}
          >
            {opt.label}
          </span>
        ))}
      </div>
    </div>
  );
}
