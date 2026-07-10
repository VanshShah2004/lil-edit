import { Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import RouteFallback from "@/components/RouteFallback";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, Package, Globe, MapPin } from "lucide-react";

// Kept in sync with the FAQ "Orders & Shipping" section.
const POINTS = [
  {
    icon: Package,
    title: "Packed with care",
    body: "Every order is hand-packed within 1–2 business days.",
  },
  {
    icon: MapPin,
    title: "Domestic delivery",
    body: "Orders within India arrive in 4–7 business days.",
  },
  {
    icon: Globe,
    title: "Worldwide shipping",
    body: "International orders take 7–14 business days. Rates are shown at checkout.",
  },
  {
    icon: Truck,
    title: "Track every step",
    body: "You'll get tracking by email, and can check order status from your account.",
  },
];

const Shipping = () => {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <RouteFallback />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pt-[var(--navbar-height)]">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-1">
        <section className="w-full bg-[#E9DFF5] border-b border-[#DCD0EB]/60">
          <div className="page-container pt-12 pb-12 md:pt-16 md:pb-16 lg:pt-[60px] lg:pb-20 text-center">
            <span className="inline-flex items-center gap-2 text-xs md:text-sm font-body font-bold tracking-[0.35em] text-[#0B5B55] mb-5 uppercase">
              <Truck className="h-4 w-4" />
              Shipping
            </span>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] font-semibold text-black mb-4">
              Shipping & <span className="text-[#0B5B55]">Delivery</span>
            </h1>
            <p className="text-[#4A4A4A] font-body text-base md:text-lg leading-relaxed max-w-2xl mx-auto">
              From our little studio to your doorstep — here's how your order travels.
            </p>
          </div>
        </section>

        <section className="page-container py-10 md:py-14">
          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:gap-6">
              {POINTS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl border border-gray-400 bg-card p-4 sm:p-6 text-center"
                >
                  <Icon className="h-6 w-6 text-[#0B5B55] mb-3 mx-auto" />
                  <h2 className="font-display text-lg font-semibold text-foreground mb-2">{title}</h2>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>

            <p className="font-body text-sm text-muted-foreground pt-8 text-center">
              Have a question about your order? Visit our{" "}
              <Link to="/faq#shipping" className="text-primary hover:underline">
                FAQ
              </Link>{" "}
              or{" "}
              <Link to="/contact" className="text-primary hover:underline">
                contact us
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Shipping;
