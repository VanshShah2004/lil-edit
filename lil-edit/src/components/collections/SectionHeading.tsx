import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

// Section heading in the arrivals language: title + count, blurb underneath,
// optional "View all" on the right.
//
// Lives here rather than inside Collections.tsx because the Browse the
// Collections strip is now a curated section the admin previews standalone —
// both it and the page's other sections need the same heading.
export default function SectionHeading({
  label, count, blurb, to,
}: { label: string; count?: number; blurb: string; to?: string }) {
  return (
    <>
      <div className="flex items-end justify-between gap-3 mb-1">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">{label}</h2>
          {count !== undefined && <span className="text-xs font-semibold text-gray-400">{count}</span>}
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
