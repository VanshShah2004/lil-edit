import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { CATEGORIES, paletteFor } from "@/pages/category/categories";
import { fetchCategoryCounts, type CategoryCounts } from "@/services/categoryService";

/**
 * "Shop by Category" — the four wear types, under Browse Collections.
 *
 * ── Why this is a separate section and not five more placards ───────────────
 * The strip above it holds COLLECTIONS: New Arrivals, Girls, Boys, Trending, By
 * Occasion — edits, curated or derived, that a piece drifts in and out of. These
 * are the TAXONOMY: every product carries exactly one, chosen from the dropdown
 * in AddProduct. Folding them into the same carousel would say the two are the
 * same kind of thing, and a shopper would reasonably wonder why "Girls" and
 * "Ethnic Wear" can both be true of one dress.
 *
 * ── Why they don't look like the tiles above them ───────────────────────────
 * Each tile is printed on its category's own placard ground, in the same cream
 * and gold that page uses, because that is exactly what the shopper lands on:
 * tap the maroon plate, arrive at the maroon plate. The pastel gradients above
 * belong to the collections, so keeping the two registers apart is what stops
 * this reading as five more of the same.
 *
 * The type is set to be READ, though — the name large in the display face, the
 * count at 13px in plain sentence case. An earlier pass at the sibling tiles on
 * the category page itself used 10px letterspaced caps at 78% opacity over this
 * same dot texture, and it was properly hard going. The ground can be dark; the
 * words on it cannot be small, pale and tracked out as well.
 */
export default function CategoryStrip() {
  // One request for all four sizes. Its own catch, so a counts failure costs the
  // strip its numbers and nothing else — these are a way into four pages first
  // and a stat second.
  const [counts, setCounts] = useState<CategoryCounts | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    console.log("[CategoryStrip] fetching category counts");

    fetchCategoryCounts(ctrl.signal)
      .then((data) => {
        console.log("[CategoryStrip] category counts resolved:", data);
        setCounts(data);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") {
          console.log("[CategoryStrip] counts fetch aborted");
          return;
        }
        console.error("[CategoryStrip] counts fetch failed:", err);
      });

    return () => ctrl.abort();
  }, []);

  return (
    <section>
      <SectionHeading
        label="Shop by Category"
        count={CATEGORIES.length}
        blurb="Every piece sits in one. Start from the kind of thing you need."
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {CATEGORIES.map((c) => (
          <CategoryTile key={c.slug} slug={c.slug} label={c.label} field={c.field} count={counts?.[c.slug]} />
        ))}
      </div>
    </section>
  );
}

function CategoryTile({
  slug, label, field, count,
}: {
  slug: string;
  label: string;
  field: string;
  /** undefined until the counts land, or if the request failed. */
  count?: number;
}) {
  const p = paletteFor(field);

  // The last word goes italic, the same treatment the category's own placard
  // gives its name — it is the signature of that type, and carrying it here is
  // most of what makes a tile read as a piece of the page behind it. Weight 500
  // because only 400/500 italics are loaded; 700 would synthesise a faux bold.
  const words = label.split(" ");
  const lead = words.slice(0, -1).join(" ");
  const tail = words[words.length - 1];

  return (
    <Link
      to={`/collections/${slug}`}
      className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl border border-gray-400 p-4 shadow-md transition-all hover:border-gray-500 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5 sm:p-5"
      style={{ backgroundColor: field }}
    >
      {/* Bandhani — the same dot grid the placard carries, so the ground reads as
          dyed cloth rather than a flat swatch. The grid opens up and the dot
          fades below sm: these tiles sit two to a row there, small enough that a
          shopper takes in the whole ground at once, and a dot that repeats across
          all of it reads as a polka print — see .bandhani in index.css. */}
      <span
        className="bandhani pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          ["--bandhani" as string]: p.dots,
          ["--bandhani-phone" as string]: p.dotsPhone,
        }}
      />

      <span
        className="relative block font-body text-[9px] font-bold uppercase sm:text-[10px]"
        style={{ letterSpacing: "0.25em", marginRight: "-0.25em", color: p.trim }}
      >
        Category
      </span>

      <h3
        className="relative mt-1.5 font-display text-xl leading-[1.05] sm:text-2xl"
        style={{ color: p.text, fontWeight: 700, letterSpacing: "-0.02em" }}
      >
        {lead && <>{lead} </>}
        <em style={{ fontStyle: "italic", fontWeight: 500 }}>{tail}</em>
      </h3>

      <span
        className="relative mt-2.5 block h-px w-8"
        aria-hidden="true"
        style={{ backgroundColor: p.trim }}
      />

      {/* The arrow is always here, so this row holds its height whether or not the
          count has landed — the name above it doesn't shift when the request
          resolves. A missing count prints nothing rather than "0 pieces", which
          would be a claim rather than a gap.

          "Pieces" counts colourways, matching the listing page this tile opens:
          a tile promising 12 that lands on 18 cards is a tile that lied. */}
      <span className="relative mt-2.5 flex items-center justify-between gap-2">
        <span className="font-body text-[11px] sm:text-[13px]" style={{ color: p.textMuted }}>
          {count === undefined ? "" : `${count} ${count === 1 ? "piece" : "pieces"}`}
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: p.text }}
        />
      </span>
    </Link>
  );
}
