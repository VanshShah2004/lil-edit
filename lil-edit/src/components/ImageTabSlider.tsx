import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export interface ImageTab {
  key: string;
  label: string;
  /** Optional swatch color shown as a dot before the label. */
  hex?: string;
}

interface ImageTabSliderProps {
  tabs: ImageTab[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * A multi-segment sliding control for the Image Studio tabs. A white pill
 * marks the active tab and can be dragged across the segments; on release it
 * snaps to the nearest one. Tapping a segment also selects it.
 *
 * Same three-layer approach as the stock slider:
 *  - transparent click targets (bottom)
 *  - draggable pill (middle)
 *  - labels (top, non-interactive)
 */
export default function ImageTabSlider({
  tabs,
  value,
  onChange,
  className = "",
}: ImageTabSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [seg, setSeg] = useState(0);
  const n = tabs.length;
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === value),
  );

  // Each segment = (track width - 8px padding) / number of tabs.
  useEffect(() => {
    const measure = () => {
      const w = trackRef.current?.offsetWidth ?? 0;
      setSeg(n > 0 ? (w - 8) / n : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [n]);

  return (
    <div
      ref={trackRef}
      className={`relative flex p-1 bg-gray-50 rounded-2xl border border-gray-300 select-none touch-none overflow-hidden ${className}`}
    >
      {/* Bottom layer: transparent click targets */}
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className="relative z-10 flex-1 min-w-0 h-9 rounded-md"
          aria-label={t.label}
        />
      ))}

      {/* Middle layer: draggable pill */}
      {seg > 0 && (
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: seg * (n - 1) }}
          dragElastic={0.03}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            const idx = Math.round((activeIndex * seg + info.offset.x) / seg);
            const clamped = Math.min(n - 1, Math.max(0, idx));
            onChange(tabs[clamped].key);
          }}
          animate={{ x: activeIndex * seg }}
          transition={{ type: "spring", stiffness: 500, damping: 38 }}
          className="absolute top-1 bottom-1 left-1 z-20 rounded-md bg-white shadow-sm border border-gray-300 cursor-grab active:cursor-grabbing"
          style={{ width: seg }}
        />
      )}

      {/* Top layer: labels (non-interactive so they never block the drag) */}
      <div className="absolute inset-0 z-30 flex pointer-events-none p-1">
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <div
              key={t.key}
              className={`flex-1 min-w-0 flex items-center justify-center gap-2 px-2 text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 ${
                active ? "text-gray-900" : "text-gray-500"
              }`}
            >
              {t.hex && (
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black/5 shrink-0"
                  style={{ backgroundColor: t.hex }}
                />
              )}
              <span className="truncate">{t.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
