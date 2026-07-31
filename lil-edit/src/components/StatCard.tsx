import type { ReactNode } from "react";

/**
 * Compact summary stat card — coloured icon chip + value + label.
 *
 * Shared across the Reviews, Cart and Wishlist pages. Designed to sit in a
 * `grid grid-cols-3` row: stacks the icon above the text on mobile so three
 * fit on one line, then switches to icon-beside-text on `sm`+.
 */
export default function StatCard({
  icon,
  value,
  label,
  accent,
}: {
  icon: ReactNode;
  value: number | string;
  label: string;
  /** Tailwind background class for the icon chip, e.g. "bg-brand-teal". */
  accent: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-1.5 sm:flex-row sm:justify-center sm:text-left sm:gap-3 rounded-2xl border border-gray-400 bg-white px-2 py-3 sm:px-4 shadow-lg ring-1 ring-black/10">
      <span className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full ${accent} shrink-0`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-[11px] leading-tight sm:text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
