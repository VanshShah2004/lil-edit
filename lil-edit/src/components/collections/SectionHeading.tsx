import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// Section heading in the arrivals language: title + count, blurb underneath,
// optional "View all" on the right.
//
// Lives here rather than inside Collections.tsx because the Browse the
// Collections strip is now a curated section the admin previews standalone —
// both it and the page's other sections need the same heading. Every count badge
// on the page comes from here, so there is one definition of what one looks like.
export default function SectionHeading({
  label, count, blurb, to,
}: { label: string; count?: number; blurb: string; to?: string }) {
  return (
    <>
      <div className="flex items-end justify-between gap-3 mb-1">
        {/* items-center, not items-baseline: a badge sitting on the heading's
            baseline hangs low against type this size — it reads as centred. */}
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">{label}</h2>
          {count !== undefined && (
            /* min-w matches the height, so a single digit is a true circle and
               anything longer grows into a pill rather than being clipped by a
               fixed square. Grid rather than flex so one property centres both
               axes, and .numeral-centered pins the vertical exactly — see its
               note in index.css for why digits don't centre on their own. */
            <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-brand-teal px-1.5">
              <span className="numeral-centered text-[11px] font-bold tabular-nums text-white">
                {count}
              </span>
            </span>
          )}
        </div>
        {to && (
          <Link
            to={to}
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-brand-teal hover:underline shrink-0"
          >
            View All
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      <p className="text-xs sm:text-sm text-gray-500 mb-5">{blurb}</p>
    </>
  );
}
