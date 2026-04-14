import { useEffect } from "react";
import Footer from "@/components/layout/Footer";
import FeaturedCategories from "@/components/home/FeaturedCategories";
import OffersBanner from "@/components/home/OffersBanner";
import RecommendedForYou from "@/components/home/RecommendedForYou";
import TrendingSection from "@/components/home/TrendingSection";
import UserNavbar from "@/components/home/UserNavbar";

const Home = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-secondary/20 to-background font-body selection:bg-primary/20">
      <UserNavbar />
      <main className="flex-1 pt-24 md:pt-28">
        <TrendingSection />
        <FeaturedCategories />
        <RecommendedForYou />
        <OffersBanner />
      </main>
      <Footer />
    </div>
  );
};

export default Home;
