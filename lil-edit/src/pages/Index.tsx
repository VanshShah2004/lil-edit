import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/landing/HeroSection";
import CategoriesSection from "@/components/landing/CategoriesSection";
import FeaturesBar from "@/components/landing/FeaturesBar";
import CtaBanner from "@/components/landing/CtaBanner";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !loading) {
      navigate('/home', { replace: true });
    }
  }, [user, loading, navigate]);

  // Don't render landing page if redirecting
  if (user) return null;

  return (
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
};

export default Index;
