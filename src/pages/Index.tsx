import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/landing/HeroSection";
import CategoriesSection from "@/components/landing/CategoriesSection";
import FeaturesBar from "@/components/landing/FeaturesBar";
import CtaBanner from "@/components/landing/CtaBanner";

const Index = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1">
      <HeroSection />
      <FeaturesBar />
      <CategoriesSection />
      <CtaBanner />
    </main>
    <Footer />
  </div>
);

export default Index;
