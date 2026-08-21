import { Truck, ShieldCheck, Leaf, Gift } from "lucide-react";

const features = [
  { icon: Truck, label: "World-Wide Delivery", desc: "Spreading culture world-wide" },
  { icon: ShieldCheck, label: "Comfort & Cool", desc: "100% comfort guaranteed" },
  { icon: Leaf, label: "Eco-Friendly", desc: "Sustainable materials" },
  { icon: Gift, label: "Gift Wrapping", desc: "Beautiful packaging" },
];

/**
 * The trust bar. `tone` picks the ground it prints on.
 *
 * About runs story (lavender) → categories → THIS → CTA, so this band has to be
 * the tinted one, or the bottom three-quarters of the page is a single unbroken
 * white stretch. The other importer, pages/Index, sits it directly ABOVE a
 * lavender CategoriesSection, where that same choice would butt two tinted bands
 * together — hence a prop rather than a new hard-coded ground. White is the
 * default so that file is untouched; note it is not currently routed (App.tsx
 * mounts Home at "/"), so About is the only live caller today.
 *
 * What changes on lavender is the icon chip: bg-primary/[0.07] is a tint doing
 * its work against white, and against a ground that is ALREADY pale purple it
 * all but vanishes — so the chip goes solid white and reads as an object sitting
 * on the band. Its ring and the section rule both move to #DCD0EB, the same edge
 * the About story band above it carries, rather than --border, which is within a
 * few percent of the lavender itself and would draw nothing.
 *
 * The type needs no adjustment: --muted-foreground holds 4.9:1 on #E9DFF5, so
 * the small desc line clears AA on both grounds.
 */
const FeaturesBar = ({ tone = "white" }: { tone?: "white" | "lavender" }) => {
  const lavender = tone === "lavender";

  return (
    <section
      className={
        lavender
          ? "bg-[#E9DFF5] border-y border-[#DCD0EB]/50"
          : "bg-white border-y border-border/60"
      }
    >
      <div className="container mx-auto px-4 lg:px-8 py-8 md:py-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 md:gap-8">
          {features.map((f) => (
            <div key={f.label} className="flex flex-col items-center text-center gap-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ring-1 ${
                  lavender ? "bg-white ring-[#DCD0EB]" : "bg-primary/[0.07] ring-border/40"
                }`}
              >
                <f.icon className="h-5 w-5 text-primary opacity-90" />
              </div>
              <div>
                <p className="font-body text-sm font-semibold text-foreground">{f.label}</p>
                <p className="font-body text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesBar;
