import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/landing/HeroSection";
import CategoriesSection from "@/components/landing/CategoriesSection";
import FeaturesBar from "@/components/landing/FeaturesBar";
import CtaBanner from "@/components/landing/CtaBanner";
import logo from "@/assets/logo.png";



const About = () => {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }


  return (
    <div className="min-h-screen bg-background flex flex-col pt-[var(--navbar-height)]">
      {user ? <UserNavbar /> : <Navbar />}
      <main className="flex-1">
        {/* The Lil Edit Story Section */}
        <section className="w-full bg-[#E9DFF5] border-y border-[#DCD0EB]/50">
          <div className="page-container pt-2 pb-6 lg:pt-2 lg:pb-2">
            <div className="flex flex-col lg:flex-row items-center">
              {/* Left Side: Logo/Image */}
              <div className="w-full lg:w-[45%] p-8 lg:p-6 flex justify-center items-center">
                <div className="bg-[#F8F5EE] aspect-square w-full max-w-[400px] rounded-3xl shadow-xl shadow-purple-900/5 flex flex-col items-center justify-center p-8 relative group transition-transform duration-500 hover:scale-[1.02]">
                  {/* Decorative Icon */}
                  <img src={logo} alt="The Lil Edit" className="w-full h-auto max-w-[280px] drop-shadow-md" />
                </div>
              </div>

              {/* Right Side: Content */}
              <div className="w-full lg:w-[55%] p-8 lg:p-8 lg:pl-4 flex flex-col items-center text-center lg:items-start lg:text-left justify-center">
                <span className="text-xs md:text-sm font-body font-bold tracking-[0.4em] text-[#0B5B55] mb-6 uppercase">
                  THE LIL EDIT STORY
                </span>
                <h2 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] mb-8 font-semibold">
                  <span className="text-black whitespace-nowrap">Where Culture Meets</span> <br />
                  <span className="text-[#0B5B55]">Cool</span>
                </h2>
                <p className="text-[#4A4A4A] font-body text-base md:text-lg leading-relaxed mb-10 max-w-xl">
                  At LilEdit, we believe style has no age. Our curated collections bring high-fashion aesthetics to the playground, blending premium fabrics with effortless silhouettes for the little ones who are born to stand out.
                </p>

              </div>
            </div>
          </div>
        </section>
        <FeaturesBar />
        <CategoriesSection />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
};

export default About;
