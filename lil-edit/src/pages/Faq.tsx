import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Truck,
  Ruler,
  CreditCard,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Search,
  X,
  Mail,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import RouteFallback from "@/components/RouteFallback";
import { useAuth } from "@/contexts/AuthContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Where "still have questions" / exchange requests go. Brand domain is
// theliledit.com (see the system@theliledit.internal actor used server-side).
const SUPPORT_EMAIL = "hello.theliledit@gmail.com";

type FaqLink = { to: string; label: string; external?: boolean };
type FaqItem = { q: string; a: string; link?: FaqLink };
type FaqSection = {
  id: string;
  title: string;
  icon: LucideIcon;
  blurb: string;
  items: FaqItem[];
};

// One source of truth for every question. Answers are plain strings so the
// search box can match against them cheaply; an optional `link` renders a
// single call-to-action under the answer. Content is written to match how the
// store actually works — guest checkout, worldwide shipping, exchanges & store
// credit (we don't do card refunds), Razorpay payments, and the FIRST10 coupon.
const SECTIONS: FaqSection[] = [
  {
    id: "shipping",
    title: "Orders & Shipping",
    icon: Truck,
    blurb: "Getting your little treasures to your door.",
    items: [
      {
        q: "How long will my order take to arrive?",
        a: "We hand-pack every order within 1–2 business days. From there, domestic orders usually arrive in 4–7 business days, while international deliveries take about 7–14 business days depending on your location and local customs.",
      },
      {
        q: "Do you ship worldwide?",
        a: "Yes — we love spreading a little cool culture across the globe. Shipping rates and estimated delivery times for your country are shown at checkout before you pay, so there are no surprises.",
      },
      {
        q: "How can I track my order?",
        a: "As soon as your order ships, we email you a confirmation with tracking details. You can also check the live status of every order any time from your account.",
        link: { to: "/orders", label: "Track my orders" },
      },
      {
        q: "Can I change my order after placing it?",
        a: "Because we start packing quickly, we can only tweak details (like a shipping address or a size swap) while your order is still marked Confirmed and hasn't moved to Processing. Email us as soon as you can and we'll do everything we can to help.",
        link: { to: `mailto:${SUPPORT_EMAIL}`, label: "Email us", external: true },
      },
      {
        q: "Do you offer gift wrapping?",
        a: "We do! Beautiful, giftable packaging is available so your order arrives ready to delight. Just choose the gift-wrap option at checkout.",
      },
      {
        q: "Will I have to pay customs or duties?",
        a: "International orders may be subject to import duties or taxes set by your country. These aren't included in your order total and are collected by your local customs — they're the responsibility of the recipient.",
      },
    ],
  },
  {
    id: "sizing",
    title: "Sizing & Fit",
    icon: Ruler,
    blurb: "Finding the perfect fit for your little one.",
    items: [
      {
        q: "How do your sizes work?",
        a: "Our pieces are sized by age range (for example 2–3Y or 4–5Y). Every product page has a detailed size guide with chest, waist, and height measurements so you can match to your child.",
      },
      {
        q: "My child is between sizes — should I size up?",
        a: "We usually recommend sizing up for a little extra growing room, especially for outerwear and knits. Our styles are designed with a relaxed, comfy fit in mind.",
      },
      {
        q: "Are your clothes true to size?",
        a: "Most of our styles run true to size with a comfortable, easy fit. Whenever a piece runs a little small or large, we call it out right on the product page.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments & Coupons",
    icon: CreditCard,
    blurb: "Secure checkout and a little something off.",
    items: [
      {
        q: "What payment methods do you accept?",
        a: "You can pay with all major credit and debit cards, UPI, net banking, and popular wallets through our secure payment partner, Razorpay.",
      },
      {
        q: "Is it safe to pay on your site?",
        a: "Yes. Payments are handled securely by Razorpay, a trusted payment gateway — we never see or store your full card details.",
      },
      {
        q: "Do I need an account to check out?",
        a: "Not at all! You can browse, add to your bag, and shop as a guest. We only ask you to sign in at checkout, so we can save your order and keep you posted on its journey.",
      },
      {
        q: "How do I use a coupon code?",
        a: "Enter your code in the coupon field at checkout and hit Apply — your discount updates instantly. New to The Lil Edit? Use FIRST10 for a little welcome treat on your first order.",
        link: { to: "/collections", label: "Start shopping" },
      },
      {
        q: "Why isn't my coupon working?",
        a: "Some codes are one-time-use, first-order-only, or have a minimum spend. Double-check the terms of your code, make sure it hasn't already been used, and watch out for any extra spaces when you type it in.",
      },
    ],
  },
  {
    id: "care",
    title: "Products & Care",
    icon: Sparkles,
    blurb: "Keeping every piece soft, bright, and loved.",
    items: [
      {
        q: "How should I care for my Lil Edit pieces?",
        a: "Wash cool, turn garments inside-out, and hang or lay flat to dry to keep colours bright and fabrics soft. The exact care instructions live on each garment's label and product page.",
      },
      {
        q: "Are your materials eco-friendly?",
        a: "We choose sustainable, skin-friendly fabrics wherever we can — because comfort should feel good all round, for little ones and the planet.",
        link: { to: "/about", label: "Read our story" },
      },
      {
        q: "Will a sold-out item be restocked?",
        a: "Our most-loved pieces do sell out fast! Tap the heart to save it to your wishlist and check back — many favourites make a comeback.",
        link: { to: "/wishlist", label: "View my wishlist" },
      },
    ],
  },
  {
    id: "account",
    title: "Account & Privacy",
    icon: ShieldCheck,
    blurb: "Your account, favourites, and your data.",
    items: [
      {
        q: "How do I create an account?",
        a: "Tap Sign Up, pop in your email, and you're in. An account lets you save favourites, track your orders, and check out a little faster next time.",
        link: { to: "/signup", label: "Create an account" },
      },
      {
        q: "I forgot my password — what now?",
        a: "No worries at all. Choose Reset Password on the login page and we'll email you a secure link to set a new one.",
        link: { to: "/forgot-password", label: "Reset my password" },
      },
      {
        q: "Can I save items for later?",
        a: "Yes! Tap the heart on any product to add it to your wishlist. Guests get a wishlist too — sign in and it stays saved across all your devices.",
        link: { to: "/wishlist", label: "View my wishlist" },
      },
      {
        q: "How do I leave a review?",
        a: "Once your order is delivered, head to My Reviews to share your thoughts. Reviews are tied to the exact size and style you bought, so they genuinely help other parents.",
        link: { to: "/reviews", label: "Write a review" },
      },
      {
        q: "How do you use my personal information?",
        a: "We only use your details to process your orders and — if you opt in — to send the occasional cute update. We never sell your data, and you can unsubscribe from emails any time.",
      },
    ],
  },
];

// Flattened, search-friendly view of every question with its section context.
type FlatItem = FaqItem & {
  sectionId: string;
  sectionTitle: string;
  icon: LucideIcon;
};

const ALL_ITEMS: FlatItem[] = SECTIONS.flatMap((section) =>
  section.items.map((item) => ({
    ...item,
    sectionId: section.id,
    sectionTitle: section.title,
    icon: section.icon,
  })),
);

/** Renders the optional call-to-action beneath an answer. */
function AnswerLink({ link }: { link: FaqLink }) {
  const className =
    "mt-3 inline-flex items-center gap-1.5 text-sm font-body font-semibold text-primary hover:gap-2.5 transition-all";
  const content = (
    <>
      {link.label}
      <ArrowRight className="h-3.5 w-3.5" />
    </>
  );
  return link.external ? (
    <a href={link.to} className={className}>
      {content}
    </a>
  ) : (
    <Link to={link.to} className={className}>
      {content}
    </Link>
  );
}

function Answer({ item }: { item: FaqItem }) {
  return (
    <div className="flex flex-col">
      <p className="font-body text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
      {item.link ? <AnswerLink link={item.link} /> : null}
    </div>
  );
}

const Faq = () => {
  const { user, loading: authLoading } = useAuth();
  const { hash } = useLocation();
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim().toLowerCase();
  const searching = trimmed.length > 0;

  const results = useMemo(() => {
    if (!searching) return ALL_ITEMS;
    return ALL_ITEMS.filter((item) =>
      `${item.q} ${item.a} ${item.sectionTitle}`.toLowerCase().includes(trimmed),
    );
  }, [searching, trimmed]);

  // Deep links from the footer (e.g. /faq#returns) should glide to the right
  // section. ScrollToTop resets scroll on route change via a layout effect, so
  // we defer a tick to run after it and land on the anchor. scroll-mt on each
  // section keeps the heading clear of the fixed navbar.
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    setActiveSection(id);
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [hash]);

  if (authLoading) {
    return <RouteFallback />;
  }

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pt-[var(--navbar-height)]">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1">
        {/* Hero — mirrors the About page's lavender band + teal accent so the two
            info pages read as siblings. */}
        <section className="w-full bg-[#E9DFF5] border-b border-[#DCD0EB]/60">
          <div className="page-container pt-12 pb-12 md:pt-16 md:pb-16 lg:pt-[60px] lg:pb-20 text-center">
            <span className="inline-flex items-center gap-2 text-xs md:text-sm font-body font-bold tracking-[0.35em] text-[#0B5B55] mb-5 uppercase">
              <HelpCircle className="h-4 w-4" />
              How can we help?
            </span>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] font-semibold text-black mb-4">
              Frequently Asked <span className="text-[#0B5B55]">Questions</span>
            </h1>
            <p className="text-[#4A4A4A] font-body text-base md:text-lg leading-relaxed max-w-2xl mx-auto mb-8">
              Everything you need to know about shopping with The Lil Edit — from sizing and
              shipping to swaps and secure checkout.
            </p>

            {/* Search */}
            <div className="max-w-xl mx-auto">
              <label htmlFor="faq-search" className="sr-only">
                Search frequently asked questions
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#0B5B55]/60" />
                <input
                  id="faq-search"
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for an answer…"
                  className="w-full rounded-lg border border-[#DCD0EB] bg-white/90 py-3.5 pl-12 pr-11 text-[15px] font-body text-foreground shadow-sm shadow-purple-900/5 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#0B5B55]/25 focus:border-[#0B5B55]/40 [&::-webkit-search-cancel-button]:appearance-none"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Category jump-nav — only useful while browsing the full list. */}
        {!searching ? (
          <div className="page-container pt-5 pb-2">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-2.5">
              {SECTIONS.map((section) => {
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => scrollToSection(section.id)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-sm border border-[#0B5B55] px-2 py-1.5 text-xs font-body transition-colors whitespace-nowrap sm:gap-2 sm:px-4 sm:text-sm ${
                      isActive
                        ? "bg-[#0B5B55] text-white"
                        : "bg-white text-[#0B5B55] hover:bg-[#E9DFF5] hover:border-[#0B5B55]/30"
                    }`}
                  >
                    <section.icon className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                    {section.title}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <section className="page-container py-8 md:py-10">
          {searching ? (
            /* ── Search results ──────────────────────────────────────────────
               Keyed on the query so the accordion remounts per keystroke and
               `defaultValue` re-opens every match — you see answers instantly. */
            <div className="max-w-3xl mx-auto">
              <p className="text-sm font-body text-muted-foreground mb-6 text-center">
                {results.length === 0
                  ? "No matching questions"
                  : `${results.length} ${results.length === 1 ? "answer" : "answers"} for “${query.trim()}”`}
              </p>

              {results.length === 0 ? (
                <div className="text-center rounded-lg border border-border/70 bg-card px-6 py-12">
                  <HelpCircle className="mx-auto h-10 w-10 text-primary/70 mb-4" />
                  <h2 className="font-display text-xl text-foreground mb-2">
                    We couldn't find that one
                  </h2>
                  <p className="font-body text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                    Try a different keyword, or reach out and a real human on the team will help
                    you out.
                  </p>
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-body font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    Email our team
                  </a>
                </div>
              ) : (
                <Accordion
                  key={trimmed}
                  type="multiple"
                  defaultValue={results.map((_, i) => `result-${i}`)}
                  className="rounded-lg border border-gray-400 bg-card px-5 sm:px-7 shadow-sm shadow-purple-900/[0.03]"
                >
                  {results.map((item, i) => (
                    <AccordionItem
                      key={`result-${i}`}
                      value={`result-${i}`}
                      className="border-gray-400 last:border-0"
                    >
                      <AccordionTrigger className="text-left font-body font-semibold text-foreground hover:no-underline gap-4 py-5">
                        <span className="flex flex-col gap-1.5">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0B5B55]/80">
                            <item.icon className="h-3 w-3" />
                            {item.sectionTitle}
                          </span>
                          {item.q}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-5">
                        <Answer item={item} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          ) : (
            /* ── Browse by category ──────────────────────────────────────── */
            <div className="max-w-3xl mx-auto space-y-12 md:space-y-16">
              {SECTIONS.map((section) => (
                <div
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 md:scroll-mt-28"
                >
                  <div className="flex items-center gap-4 mb-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#0B5B55]/10 text-[#0B5B55] ring-1 ring-[#0B5B55]/15">
                      <section.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-2xl md:text-3xl font-semibold text-foreground">
                        {section.title}
                      </h2>
                      <p className="font-body text-sm text-muted-foreground">{section.blurb}</p>
                    </div>
                  </div>

                  <Accordion
                    type="single"
                    collapsible
                    className="rounded-lg border border-gray-400 bg-card px-5 sm:px-7 shadow-sm shadow-purple-900/[0.03]"
                  >
                    {section.items.map((item, i) => (
                      <AccordionItem
                        key={`${section.id}-${i}`}
                        value={`${section.id}-${i}`}
                        className="border-gray-400 last:border-0"
                      >
                        <AccordionTrigger className="text-left font-body font-semibold text-foreground hover:no-underline gap-4 py-5">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="pb-5">
                          <Answer item={item} />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Still-need-help CTA */}
        <section className="bg-white border-y border-border/70">
          <div className="page-container py-12 md:py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl text-foreground mb-3">
              Still have questions?
            </h2>
            <p className="text-muted-foreground font-body text-sm md:text-base max-w-md mx-auto mb-8">
              Our little team is always happy to help. Drop us a line and we'll get back to you as
              soon as we can.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 font-body font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Mail className="h-4 w-4" />
              {SUPPORT_EMAIL}
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Faq;
