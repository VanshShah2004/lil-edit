import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Draggable segmented control — tap a segment or drag across them, same
// interaction as the admin Activity page's type filter. Generalized here so any
// small fixed option set (bucket, tabs, etc.) can reuse the exact mechanics
// instead of re-deriving the pointer math per usage.

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

interface SegmentedSliderProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accent?: string;
  className?: string;
}

export function SegmentedSlider<T extends string>({
  options,
  value,
  onChange,
  accent = "#0F766E",
  className,
}: SegmentedSliderProps<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const draggingRef = useRef(false);
  // Set true when a drag actually changed the selection, so the click that
  // trails a pointer interaction doesn't re-fire selection on the wrong segment.
  const didDragRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const activeIndex = Math.max(0, options.findIndex((o) => o.key === value));
  // Content-box bounds + shared segment width, captured once per drag so they
  // stay stable mid-gesture even as `value` (and the active button) changes.
  const dragMetricsRef = useRef<{ contentLeft: number; contentWidth: number; segmentWidth: number } | null>(null);

  // Slide the indicator over the selected option; skipped while dragging (the
  // pointer handlers own it then).
  useLayoutEffect(() => {
    if (isDragging) return;
    const measure = () => {
      const track = trackRef.current;
      const btn = btnRefs.current[activeIndex];
      if (track && btn) setIndicator({ left: btn.offsetLeft - track.clientLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIndex, isDragging]);

  const captureDragMetrics = () => {
    const track = trackRef.current;
    const first = btnRefs.current[0];
    const last = btnRefs.current[options.length - 1];
    if (!track || !first || !last) return;
    const contentLeft = first.offsetLeft - track.clientLeft;
    const contentWidth = last.offsetLeft - track.clientLeft + last.offsetWidth - contentLeft;
    dragMetricsRef.current = { contentLeft, contentWidth, segmentWidth: contentWidth / options.length };
  };

  // Move the indicator to directly track the pointer (clamped to the track), and
  // select whichever segment the indicator's CENTER now sits over — the
  // indicator can straddle two segments mid-drag rather than snapping instantly.
  const followPointer = (clientX: number) => {
    const track = trackRef.current;
    const metrics = dragMetricsRef.current;
    if (!track || !metrics) return;
    const trackRect = track.getBoundingClientRect();
    const rawLeft = clientX - trackRect.left - metrics.segmentWidth / 2;
    const left = Math.min(
      Math.max(rawLeft, metrics.contentLeft),
      metrics.contentLeft + metrics.contentWidth - metrics.segmentWidth
    );
    setIndicator({ left, width: metrics.segmentWidth });

    const centerX = left + metrics.segmentWidth / 2;
    const idx = Math.min(
      options.length - 1,
      Math.max(0, Math.floor((centerX - metrics.contentLeft) / metrics.segmentWidth))
    );
    const key = options[idx]?.key;
    if (key && key !== value) {
      onChange(key);
      didDragRef.current = true;
    }
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => {
        draggingRef.current = true;
        didDragRef.current = false;
        setIsDragging(true);
        captureDragMetrics();
        e.currentTarget.setPointerCapture(e.pointerId);
        followPointer(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) followPointer(e.clientX);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        setIsDragging(false);
        dragMetricsRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
        setIsDragging(false);
        dragMetricsRef.current = null;
      }}
      className={cn(
        "relative flex cursor-grab touch-none select-none rounded-md border border-gray-200 bg-white p-1 active:cursor-grabbing",
        className
      )}
    >
      {/* Sliding indicator. No transition while actively dragging (tracks the
          pointer 1:1); a quick ease-out snap for taps and the release settle. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 rounded-sm",
          !isDragging && "transition-[left,width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
        )}
        style={{ left: indicator.left, width: indicator.width, backgroundColor: accent }}
      />
      {options.map((o, i) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            onClick={() => {
              // Skip the click that trails a pointer selection.
              if (didDragRef.current) {
                didDragRef.current = false;
                return;
              }
              onChange(o.key);
            }}
            className={cn(
              "relative z-10 flex-1 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-semibold transition-colors",
              active ? "text-white" : "text-gray-500 hover:text-gray-800"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
