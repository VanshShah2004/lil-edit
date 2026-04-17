import { MoveRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const WelcomeHero = () => {
  const { user } = useAuth();
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const firstName =
    (typeof metadata.first_name === "string" && metadata.first_name.trim()) ||
    (typeof metadata.given_name === "string" && metadata.given_name.trim()) ||
    (typeof metadata.full_name === "string" && metadata.full_name.trim().split(/\s+/)[0]) ||
    (typeof metadata.name === "string" && metadata.name.trim().split(/\s+/)[0]) ||
    user?.email?.split("@")[0] ||
    "Guest";
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <section className="pt-32 pb-16 px-4">
      <div className="container mx-auto">
        <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-white rounded-[2rem] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 border border-white/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20" />

          <div className="z-10 max-w-xl">
            <h1 className="font-display text-4xl md:text-5xl font-semibold text-foreground mb-4">
              Welcome back, {name} <span className="text-primary">💜</span>
            </h1>
            <p className="text-lg text-muted-foreground font-body mb-8">
              Let&apos;s find something adorable today. Your little one&apos;s wardrobe is waiting to be refreshed with our newest arrivals.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button className="bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-medium hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm shadow-primary/20">
                Shop New Arrivals <MoveRight className="w-4 h-4" />
              </button>
              <button className="bg-white text-foreground border border-border px-8 py-3.5 rounded-full font-medium hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center">
                Continue Shopping
              </button>
            </div>
          </div>

          <div className="z-10 w-full md:w-1/2 relative h-[300px] md:h-[400px] rounded-2xl overflow-hidden shadow-lg border-4 border-white">
            <img
              src="https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&q=80&w=1000"
              alt="Cute baby fashion"
              className="w-full h-full object-cover rounded-xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default WelcomeHero;
