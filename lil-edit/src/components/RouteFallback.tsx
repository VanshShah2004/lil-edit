/**
 * Branded route-transition loader.
 *
 * Shown by the top-level <Suspense> in App.tsx while a lazily-split page chunk
 * is being fetched. The old fallback was a bare gray lucide spinner on a blank
 * white screen — every navigation flashed an unbranded void. This keeps the
 * store's identity on screen (logo + wordmark in Playfair, teal→lavender brand
 * ramp) so a chunk fetch reads as "The Lil Edit is loading" rather than "the
 * app broke for a second". The soft lilac page background comes from <body>.
 */

import logo from "@/assets/logo.png";

export default function RouteFallback() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="flex flex-col items-center gap-6">
        {/* Logo with a soft breathing halo */}
        <div className="relative">
          <span
            aria-hidden
            className="absolute inset-0 -m-4 rounded-full bg-brand-teal/10 blur-xl animate-pulse"
          />
          <img
            src={logo}
            alt="The Lil Edit"
            className="relative h-16 w-auto animate-[floaty_2.4s_ease-in-out_infinite]"
          />
        </div>

        {/* Wordmark */}
        <p
          className="text-xl tracking-wide text-foreground"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          The Lil Edit
        </p>

        {/* Brand-ramp progress track — an indeterminate sweep */}
        <div className="h-1 w-40 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-brand-teal via-[#B19CD9] to-emerald-400 animate-[sweep_1.15s_ease-in-out_infinite]" />
        </div>

        <span className="sr-only">Loading…</span>
      </div>

      {/* Component-scoped keyframes — no Tailwind config change needed. */}
      <style>{`
        @keyframes sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        @keyframes floaty {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[floaty_2\\.4s_ease-in-out_infinite\\] { animation: none; }
        }
      `}</style>
    </div>
  );
}
