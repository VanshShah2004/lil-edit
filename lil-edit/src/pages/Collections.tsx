import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import BrowseCollections from "@/components/collections/BrowseCollections";
import Footer from "@/components/layout/Footer";
import { getBackendBaseUrl } from "@/lib/backend";
import { authHeader } from "@/lib/apiAuth";

import img1 from "@/assets/searchbar-frequent_searches/le-1.png";
import img2 from "@/assets/searchbar-frequent_searches/le-2.png";
import img3 from "@/assets/searchbar-frequent_searches/le-3.png";
import img4 from "@/assets/searchbar-frequent_searches/le-4.png";
import img5 from "@/assets/searchbar-frequent_searches/le-5.png";
import img6 from "@/assets/searchbar-frequent_searches/le-6.png";

// Visual language borrowed from the New Arrivals page (pages/arrivals/ArrivalsPage):
// eyebrow + gradient-accent heading, a scrolling ticker under the hero, section
// headings with a count and blurb, and an image-fill bento mosaic. Kept local to
// this file so the five ArrivalsPage-driven collection pages stay untouched.

const TICKER_WORDS = [
  "Featured Collections", "Spring/Summer '26",
  "Styled by You", "The Lil Edit",
];

const galleryImages = [
  { id: "gal-1", image: img1, caption: "Sunset Vibes", price: "3200" },
  { id: "gal-2", image: img2, caption: "City Style", price: "4100" },
  { id: "gal-3", image: img3, caption: "Nature Explorer Into the Space of the Universe", price: "2800" },
  { id: "gal-4", image: img4, caption: "Party Ready", price: "5500" },
  { id: "gal-5", image: img5, caption: "Cozy Comfort", price: "3600" },
  { id: "gal-6", image: img6, caption: "Trendsetter", price: "4800" },
  { id: "gal-7", image: img3, caption: "Summer Glow", price: "3900" },
  { id: "gal-8", image: img1, caption: "Mini Chic", price: "2600" },
];

// Hand-tuned row spans, same mosaic rhythm the arrivals page uses for its
// "From the Collection" tail. Rows are 90–120px so the shortest tile still
// reads as a garment rather than a sliver of fabric.
const BENTO_SPANS = [
  "row-span-3", "row-span-2", "row-span-3", "row-span-4",
  "row-span-2", "row-span-3", "row-span-2", "row-span-3",
];

export default function Collections() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong. Please try again.");
        return;
      }

      toast.success(
        data.action === "already_subscribed"
          ? "You're already on the list!"
          : "You're in! Watch your inbox for cute updates."
      );
      setEmail("");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return <RouteFallback />;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden w-full">
      {/* Page-local keyframes: ticker scroll (mirrors ArrivalsPage) */}
      <style>{`
        @keyframes col-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .col-ticker-track { animation: none !important; }
        }
      `}</style>

      {user ? <UserNavbar /> : <Navbar />}
      <div className="pt-[var(--navbar-height)]" />

      {/* HERO */}
      <section className="relative w-full bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100 overflow-hidden">
        <div className="absolute inset-0 opacity-40 sm:opacity-50" aria-hidden="true">
          <div className="absolute -top-10 left-1/4 w-72 h-72 bg-pink-300 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 right-1/5 w-80 h-80 bg-blue-300 rounded-full blur-3xl" />
          <div className="absolute top-1/3 -left-10 w-56 h-56 bg-purple-300 rounded-full blur-3xl" />
        </div>

        {/* Without the tagline this hero is three rows (eyebrow, heading, CTAs),
            the same count as the New Arrivals hero — so it can share that page's
            padding instead of compensating for an extra row. Mobile stays lower
            because the two CTAs stack there. */}
        <div className="relative z-10 flex flex-col items-center text-center px-4 sm:px-6 py-20 sm:py-28 md:py-[123px]">
          <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-brand-teal mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Every Little Personality
          </span>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold leading-none mb-8 text-gray-900">
            Curated
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0C5D53] via-[#7B5AB5] to-emerald-700"> Collections</span>
          </h1>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto justify-center">
            <Button
              onClick={() => navigate("/collections/new-arrivals")}
              className="bg-gray-900 hover:bg-gray-800 text-white px-6 sm:px-8 h-11 sm:h-12 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              Shop new arrivals
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/collections/trending")}
              className="border-0 text-gray-900 hover:bg-gray-100 px-6 sm:px-8 h-11 sm:h-12 rounded-xl font-semibold transition-colors"
            >
              See what's trending
            </Button>
          </div>
        </div>

        {/* SCROLLING TICKER */}
        <div className="relative z-10 border-t border-gray-400 bg-white/60 overflow-hidden py-2.5 shadow-sm">
          <div
            className="col-ticker-track flex w-max whitespace-nowrap"
            style={{ animation: "col-ticker 22s linear infinite" }}
          >
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
                {TICKER_WORDS.concat(TICKER_WORDS).map((w, i) => (
                  <span key={`${copy}-${i}`} className="flex items-center text-[11px] sm:text-xs font-bold uppercase tracking-[0.25em] text-gray-500">
                    <span className="px-4 sm:px-6">{w}</span>
                    <span className="text-brand-teal">✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="w-full py-8 sm:py-12 md:py-14">
        <div className="px-4 sm:px-8 md:px-12 lg:px-16">
          <div className="max-w-5xl mx-auto space-y-12 sm:space-y-16">
            {/* BROWSE THE COLLECTIONS — the placard carousel plus the tile
                rows. Carries its own section heading; the placard images are
                admin-curatable via the Spotlight (collections_browse). */}
            <BrowseCollections />
          </div>
        </div>

        {/* SEASON HIGHLIGHT BANNER — full width */}
        <section className="w-full py-12 sm:py-14 md:py-16">
          <div className="relative overflow-hidden bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 py-28 sm:py-32 md:py-36 px-4 sm:px-8 md:px-12 lg:px-16 flex items-center justify-center text-center">
            <div className="absolute inset-0 opacity-20" aria-hidden="true">
              <div className="absolute top-0 left-0 w-64 sm:w-96 h-64 sm:h-96 bg-white rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-0 w-56 sm:w-80 h-56 sm:h-80 bg-white rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 max-w-3xl">
              <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-gray-800 mb-4 bg-white/70 px-3 py-1.5 rounded-full">
                <Sparkles className="w-3.5 h-3.5" />
                Limited edition
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3">
                Spring/Summer '26
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-gray-800 mb-6">
                Designed for comfort, crafted for style. The season's line-up, all in one place.
              </p>
              <Button
                onClick={() => navigate("/collections/new-arrivals")}
                className="bg-gray-900 hover:bg-gray-800 text-white px-6 sm:px-8 h-11 sm:h-12 rounded-full font-semibold text-sm sm:text-base transition-colors"
              >
                Shop the season
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </section>

        <div className="px-4 sm:px-8 md:px-12 lg:px-16">
          <div className="max-w-5xl mx-auto space-y-12 sm:space-y-16">
            {/* STYLED BY OUR COMMUNITY — bento mosaic */}
            <section>
              <SectionHeading
                label="Styled by Our Community"
                count={galleryImages.length}
                blurb="Real looks, worn by real little people."
              />

              <div className="grid grid-cols-2 gap-2.5 auto-rows-[90px] sm:grid-cols-3 sm:gap-3 sm:auto-rows-[100px] md:auto-rows-[120px] [grid-auto-flow:dense]">
                {galleryImages.map((item, idx) => (
                  <figure
                    key={item.id}
                    className={`group relative rounded-xl sm:rounded-2xl overflow-hidden border border-gray-400 shadow-md hover:shadow-xl hover:border-gray-500 transition-all ${BENTO_SPANS[idx % BENTO_SPANS.length]}`}
                  >
                    <img
                      src={item.image}
                      alt={item.caption}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                    <figcaption className="absolute inset-x-0 bottom-0 p-3 sm:p-4 flex flex-col items-start justify-end">
                      <span className="text-[9px] sm:text-[11px] font-semibold tracking-wider text-white/90 uppercase mb-0.5 sm:mb-1 drop-shadow-md">
                        ₹{item.price}
                      </span>
                      <h3 className="text-xs sm:text-sm md:text-base font-bold text-white leading-tight drop-shadow-md line-clamp-2 group-hover:-translate-y-1 transition-transform duration-300">
                        {item.caption}
                      </h3>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>

            {/* NEWSLETTER CTA */}
            <section>
              <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 px-4 sm:px-8 md:px-12 lg:px-16 py-12 sm:py-14 md:py-16 text-center text-white">
                <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 bg-purple-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" aria-hidden="true" />
                <div className="relative z-10">
                  <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/70 mb-4">
                    <Sparkles className="w-3.5 h-3.5" />
                    Stay in the loop
                  </span>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3">
                    Stay in Style
                  </h2>
                  <p className="text-xs sm:text-sm md:text-base opacity-90 mb-6 max-w-2xl mx-auto">
                    Get first look at new collections, special offers, and styling ideas in your inbox.
                  </p>

                  <form
                    onSubmit={handleSubscribe}
                    className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 max-w-md mx-auto"
                  >
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="px-4 py-2.5 sm:py-3 text-xs sm:text-sm rounded-lg sm:rounded-full bg-white/20 border border-white/30 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white transition-all"
                    />
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="bg-white text-gray-900 hover:bg-gray-100 px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-full font-semibold text-xs sm:text-sm flex-shrink-0 transition-colors disabled:opacity-60"
                    >
                      {submitting ? "Joining..." : "Subscribe"}
                    </Button>
                  </form>

                  <p className="text-[10px] sm:text-xs opacity-75 mt-4">
                    We respect your privacy. Unsubscribe anytime.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// Section heading in the arrivals language: title + count, blurb underneath,
// optional "View all" on the right.
function SectionHeading({
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
