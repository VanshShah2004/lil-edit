import { Truck, ShieldCheck, Leaf, Gift } from "lucide-react";

const features = [
  { icon: Truck, label: "Free Shipping", desc: "On orders over ₹999" },
  { icon: ShieldCheck, label: "Safe & Secure", desc: "100% secure checkout" },
  { icon: Leaf, label: "Eco-Friendly", desc: "Sustainable materials" },
  { icon: Gift, label: "Gift Wrapping", desc: "Beautiful packaging" },
];

const FeaturesBar = () => (
  <section className="bg-card border-y border-border">
    <div className="container mx-auto px-4 lg:px-8 py-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {features.map((f) => (
          <div key={f.label} className="flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <f.icon className="h-5 w-5 text-primary" />
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
