import { useEffect, useState } from "react";
import { Heart, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { getBackendBaseUrl } from "@/lib/backend";

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
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = "Coming soon | The Lil Edit";
  }, []);

  const handleNotifyMe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          : "Thanks! We'll let you know the moment we're back."
      );
      setEmail("");
      setSubmitted(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // No default copy: the paragraph appears only when an admin has written one.
  const body = message?.trim() || null;

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
        <div className="mx-auto flex h-20 max-w-screen-xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <img src={logo} alt="The Lil Edit" className="h-9 w-auto sm:h-10" />
            <span className="text-xl sm:text-xl text-[#2A2440] leading-none" style={{ fontFamily: "'Playfair Display', serif" }}>
              The Lil Edit
            </span>
          </div>

<div className="flex items-center gap-2">
            <InertIconButton icon={Search} />
            <InertIconButton icon={Heart} />
            <InertIconButton icon={ShoppingBag} />
          </div>
        </div>
      </header>

      {/* Hero — two panels split by a divider: vertical on desktop, horizontal on mobile. */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-6 md:py-16">
        <div className="le-maint-fade grid w-full max-w-4xl grid-cols-1 items-center gap-6 md:grid-cols-[1fr_auto_1fr] md:gap-0">
          {/* Left panel — the message ("good words"). */}
          <div className="text-center md:pr-12 md:text-left">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#E7DEF6] bg-[#F7F3FC] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#6B5B95] md:mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-[#B19CD9]" />
              Coming soon
            </p>

            <h1
              className="text-balance text-4xl leading-[1.08] text-[#2A2440] sm:text-5xl md:text-[3.2rem]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              We&rsquo;re building
              <br />
              something <span className="italic text-[#9A82C9]">lovely</span>
            </h1>

            {/* Signature: the stitched seam */}
            <div
              className={`relative mx-auto mt-5 h-6 w-[220px] md:mx-0 md:mt-8 ${body ? "mb-5 md:mb-8" : ""}`}
              aria-hidden="true"
            >
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-[#DFD3F1]" />
              <span className="le-maint-seam-bead absolute top-1/2 h-2.5 w-2.5 rounded-full bg-[#B19CD9] shadow-[0_0_0_5px_rgba(177,156,217,0.18)]" />
            </div>

            {body && (
              <p className="mx-auto max-w-md text-pretty text-[15px] leading-relaxed text-[#6B6480] md:mx-0">
                {body}
              </p>
            )}
          </div>

          {/* Divider — horizontal rule on mobile, vertical rule on desktop. */}
          <div
            aria-hidden="true"
            className="mx-auto h-px w-full max-w-md self-center bg-gradient-to-r from-transparent via-[#9A82C9] to-transparent md:h-auto md:w-px md:max-w-none md:self-stretch md:via-[#B7A4DD] md:bg-gradient-to-b"
          />

          {/* Right panel — the ask. */}
          <div className="mt-5 text-center md:mt-0 md:pl-12 md:text-left">
            <h2
              className="text-balance text-[1.9rem] leading-[1.12] text-[#2A2440] sm:text-[2.1rem]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Be the <span className="italic text-[#9A82C9]">first</span> to know
            </h2>
            {submitted ? (
              <p className="mt-6 text-sm font-medium text-[#6B5B95]">
                You&rsquo;re on the list — we&rsquo;ll email you the moment we&rsquo;re back 💜
              </p>
            ) : (
              <form onSubmit={handleNotifyMe} className="mt-4 flex w-full max-w-sm flex-col gap-2.5 md:mt-6">
                <label htmlFor="notify-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="notify-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  disabled={submitting}
                  className="w-full rounded-full border border-gray-400 bg-white px-4 py-2.5 text-sm text-[#2A2440] placeholder:text-[#A99FC0] outline-none transition focus:border-[#B19CD9] focus:ring-2 focus:ring-[#B19CD9]/25 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="shrink-0 rounded-full bg-[#B19CD9] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#9A82C9] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Sending…" : "Notify me"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Same bottom bar as the storefront's Footer — copy, type and rule match,
          minus the link columns and newsletter box (the store is closed). */}
      <footer className="relative z-10 border-t border-gray-400 bg-card">
        <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col-reverse items-center justify-center gap-3 text-center sm:flex-row sm:justify-between sm:gap-4">
            <p className="font-display text-base text-muted-foreground">
              &copy; {new Date().getFullYear()} The Lil Edit. All rights reserved.
            </p>
            <p className="flex items-center gap-1 font-display text-base text-muted-foreground">
              Made with <Heart className="h-4 w-4 fill-primary text-primary" /> for little ones
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MaintenancePage;
