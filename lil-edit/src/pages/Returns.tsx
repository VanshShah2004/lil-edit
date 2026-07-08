import { Link } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import RouteFallback from "@/components/RouteFallback";
import { useAuth } from "@/contexts/AuthContext";
import { RefreshCw, Mail } from "lucide-react";

// Kept in sync with the FAQ / footer support inbox.
const SUPPORT_EMAIL = "hello.theliledit@gmail.com";

const Returns = () => {
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
              <RefreshCw className="h-4 w-4" />
              Returns
            </span>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] font-semibold text-black mb-4">
              Returns & <span className="text-[#0B5B55]">Exchanges</span>
            </h1>
            <p className="text-[#4A4A4A] font-body text-base md:text-lg leading-relaxed max-w-2xl mx-auto">
              Little ones grow fast — we're here to help you find the perfect fit.
            </p>
          </div>
        </section>

        <section className="page-container py-10 md:py-14">
          <div className="max-w-xl mx-auto space-y-5 text-center">
            <p className="font-body text-base leading-relaxed text-muted-foreground">
              At the moment, we do not accept returns. Please choose your size carefully using the
              size guide on each product page before you order. If something isn't quite right,
              reach out anyway and our little team will do everything we can to help.
            </p>

            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-body font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Mail className="h-4 w-4" />
              {SUPPORT_EMAIL}
            </a>

            <p className="font-body text-sm text-muted-foreground pt-2">
              Have a question first? Visit our{" "}
              <Link to="/faq" className="text-primary hover:underline">
                FAQ
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

export default Returns;
