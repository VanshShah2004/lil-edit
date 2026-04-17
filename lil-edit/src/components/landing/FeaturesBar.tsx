import { Truck, ShieldCheck, Leaf, Gift } from "lucide-react";

const features = [
  { icon: Truck, label: "World-Wide Delivery", desc: "Spreading culture world-wide" },
  { icon: ShieldCheck, label: "Comfort & Cool", desc: "100% comfort guaranteed" },
  { icon: Leaf, label: "Eco-Friendly", desc: "Sustainable materials" },
  { icon: Gift, label: "Gift Wrapping", desc: "Beautiful packaging" },
];

const FeaturesBar = () => (
  <section className="bg-band-mist border-y border-border/60">
    <div className="container mx-auto px-4 lg:px-8 py-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {features.map((f) => (
          <div key={f.label} className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/[0.07] flex items-center justify-center ring-1 ring-border/40">
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

export default FeaturesBar;
