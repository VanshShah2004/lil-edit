import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/landing/HeroSection";
import CategoriesSection from "@/components/landing/CategoriesSection";
import FeaturesBar from "@/components/landing/FeaturesBar";
import CtaBanner from "@/components/landing/CtaBanner";

const About = () => {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {user ? <UserNavbar /> : <Navbar />}
      <main className="flex-1">
        <HeroSection />
        <FeaturesBar />
        <CategoriesSection />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
};

export default About;
