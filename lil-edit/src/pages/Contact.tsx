import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import RouteFallback from "@/components/RouteFallback";
import { useAuth } from "@/contexts/AuthContext";
import { Mail, MessageCircle, Clock, Phone, AtSign } from "lucide-react";

// Same support inbox used across FAQ / footer / exchanges — one source of truth.
const SUPPORT_EMAIL = "hello.theliledit@gmail.com";
const PHONE_NUMBERS = ["7045353953", "9819175073"];
const INSTAGRAM_HANDLE = "the.liledit";

const Contact = () => {
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
              <MessageCircle className="h-4 w-4" />
              Get in touch
            </span>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] font-semibold text-black mb-4">
              Contact <span className="text-[#0B5B55]">Us</span>
            </h1>
            <p className="text-[#4A4A4A] font-body text-base md:text-lg leading-relaxed max-w-2xl mx-auto">
              Questions, feedback, or just want to say hi? Our little team reads every message.
            </p>
          </div>
        </section>

        <section className="page-container py-10 md:py-14">
          <div className="max-w-xl mx-auto space-y-5">
            <div className="rounded-lg border border-gray-400 bg-card p-5 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0B5B55]/10 text-[#0B5B55]">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-foreground mb-1">Email us</h2>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-body text-sm text-primary hover:underline break-all"
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>

            <div className="rounded-lg border border-gray-400 bg-card p-5 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0B5B55]/10 text-[#0B5B55]">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-foreground mb-1">Call us</h2>
                <div className="flex flex-col gap-0.5">
                  {PHONE_NUMBERS.map((phone) => (
                    <a
                      key={phone}
                      href={`tel:+91${phone}`}
                      className="font-body text-sm text-primary hover:underline"
                    >
                      +91 {phone}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-400 bg-card p-5 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0B5B55]/10 text-[#0B5B55]">
                <AtSign className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-foreground mb-1">Instagram</h2>
                <a
                  href={`https://instagram.com/${INSTAGRAM_HANDLE}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-sm text-primary hover:underline"
                >
                  @{INSTAGRAM_HANDLE}
                </a>
              </div>
            </div>

            <p className="font-body text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Clock className="h-4 w-4 text-[#0B5B55]" />
              We usually reply within 1–2 business days.
            </p>

            <p className="font-body text-sm text-muted-foreground text-center">
              Order or sizing question? Check our{" "}
              <a href="/faq" className="text-primary hover:underline">
                FAQ
              </a>{" "}
              first — you might find the answer instantly.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
