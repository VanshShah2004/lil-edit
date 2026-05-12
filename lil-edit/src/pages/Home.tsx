import { useEffect } from "react";
import Footer from "@/components/layout/Footer";
import FeaturedCategories from "@/components/home/FeaturedCategories";
import RecommendedForYou from "@/components/home/RecommendedForYou";
import TrendingSection from "@/components/home/TrendingSection";
import UserNavbar from "@/components/home/UserNavbar";
import HomeCollage from "@/components/home/HomeCollage";
import ShopTheLook from "@/components/home/ShopTheLook";
import AboutLilEdit from "@/components/home/AboutLilEdit";
import HeroSection from "@/components/landing/HeroSection";

const Home = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen flex flex-col font-body selection:bg-primary/20">
      <UserNavbar />
      <main className="flex-1 pt-[150px] md:pt-[112px] bg-[#E8DDF7]">
        <HomeCollage />
        <HeroSection hidePhoto={true} />
        <FeaturedCategories />
        <TrendingSection />
        <RecommendedForYou />
        <ShopTheLook />
        <AboutLilEdit />
      </main>
      <Footer />
    </div>
  );
};

export default Home;
