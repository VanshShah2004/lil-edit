import { useEffect } from "react";
import { Heart, Search, ShoppingBag } from "lucide-react";
import logo from "@/assets/logo.png";

/**
 * The storefront's coming-soon page, shown to every non-admin while the site is
 * switched off (see MaintenanceGate). Brand-faithful: white canvas, lavender
 * accents, Playfair display type. The menu bar is intentionally inert — it keeps
 * the storefront's silhouette so the pause feels considered, not broken, but no
 * control does anything (the store is closed).
 *
 * Signature: a "stitched seam" — a needle bead gliding a dashed lavender seam,
 * nodding to a fashion label mid-alteration. Motion is disabled under
 * prefers-reduced-motion.
 */

// One inert, button-shaped icon from the real navbar's set. aria-hidden + not
// focusable: it's scenery, so keyboard and screen-reader users skip the dead control.
function InertIconButton({ icon: Icon }: { icon: typeof Search }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E7DEF6] bg-white text-[#9A82C9] cursor-default select-none"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

const MaintenancePage = ({ message }: { message?: string | null }) => {
  useEffect(() => {
    document.title = "Coming soon | The Lil Edit";
  }, []);

  const body =
    (message && message.trim()) ||
    "We're building something lovely for your little ones. The boutique will be live again very soon — thank you for your patience.";

  return (
    <div className="le-maint relative flex min-h-screen flex-col overflow-hidden bg-white text-[#2A2440] font-sans">
      <style>{`
        .le-maint-seam-bead {
          left: 0;
          transform: translate(-50%, -50%);
          animation: le-maint-seam 2.8s ease-in-out infinite;
        }
        @keyframes le-maint-seam {
          0%   { left: 0%; }
          50%  { left: 100%; }
          100% { left: 0%; }
        }
        .le-maint-fade { animation: le-maint-fade-in 0.7s ease-out both; }
        @keyframes le-maint-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .le-maint-seam-bead { animation: none; left: 50%; }
          .le-maint-fade { animation: none; }
        }
      `}</style>

      {/* Soft lavender wash, top — the only ambient flourish, kept static and faint. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
        style={{ background: "radial-gradient(120% 80% at 50% -10%, rgba(177,156,217,0.18), rgba(177,156,217,0) 70%)" }}
      />

      {/* Inert menu bar — the storefront silhouette, no functionality. */}
      <header className="relative z-10 border-b border-[#EFE9F8] bg-white/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <img src={logo} alt="The Lil Edit" className="h-9 w-auto sm:h-10" />
            <span className="text-lg sm:text-xl text-[#2A2440] leading-none" style={{ fontFamily: "'Playfair Display', serif" }}>
              The Lil Edit
            </span>
          </div>

          <nav aria-hidden="true" className="hidden items-center gap-9 md:flex">
            {["Home", "Collections", "About"].map((label) => (
              <span key={label} className="text-sm font-medium tracking-wide text-[#6B5B95]/70 cursor-default select-none">
                {label}
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <InertIconButton icon={Search} />
            <InertIconButton icon={Heart} />
            <InertIconButton icon={ShoppingBag} />
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-16">
        <div className="le-maint-fade w-full max-w-xl text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E7DEF6] bg-[#F7F3FC] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#6B5B95]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#B19CD9]" />
            Coming soon
          </p>

          <h1
            className="text-balance text-4xl leading-[1.08] text-[#2A2440] sm:text-5xl md:text-[3.4rem]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            We&rsquo;re building
            <br />
            something <span className="italic text-[#9A82C9]">lovely</span>
          </h1>

          {/* Signature: the stitched seam */}
          <div className="relative mx-auto my-8 h-6 w-[220px]" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-[#DFD3F1]" />
            <span className="le-maint-seam-bead absolute top-1/2 h-2.5 w-2.5 rounded-full bg-[#B19CD9] shadow-[0_0_0_5px_rgba(177,156,217,0.18)]" />
          </div>

          <p className="mx-auto max-w-md text-pretty text-[15px] leading-relaxed text-[#6B6480]">
            {body}
          </p>
        </div>
      </main>

      <footer className="relative z-10 px-6 pb-8 pt-4 text-center">
        <p className="text-xs tracking-wide text-[#A99FC0]">
          &copy; {new Date().getFullYear()} The Lil Edit &middot; Curated fashion for little ones
        </p>
      </footer>
    </div>
  );
};

export default MaintenancePage;
