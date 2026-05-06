import { useEffect } from "react";
import Footer from "@/components/layout/Footer";
import FeaturedCategories from "@/components/home/FeaturedCategories";
import RecommendedForYou from "@/components/home/RecommendedForYou";
import TrendingSection from "@/components/home/TrendingSection";
import UserNavbar from "@/components/home/UserNavbar";

const Home = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen flex flex-col font-body selection:bg-primary/20">
      <UserNavbar />
      <main className="flex-1 pt-36 md:pt-36 bg-[#E8DDF7]">
        <TrendingSection />
        <FeaturedCategories />
        <RecommendedForYou />
      </main>
      <Footer />
    </div>
  );
};

export default Home;
