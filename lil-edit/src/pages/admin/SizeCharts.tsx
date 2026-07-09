import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import SizeChartsManager from "@/components/admin/SizeChartsManager";

const ACCENT = "#B19CD9";

const SizeCharts = () => {
  useEffect(() => {
    document.title = "Sizing Chart Setup | Lil Edit";
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] flex flex-col font-sans">
      <UserNavbar />

      <div className="relative pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)] bg-white pb-0">
        <div className="max-w-screen-2xl mx-auto px-3 lg:px-6">
          <div className="pt-3 pb-2 mt-1.5 mb-1">
            <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
              <Link to="/admin/settings" className="hover:underline">
                Admin Settings
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-800 font-medium">Sizing Chart Setup</span>
            </div>
          </div>
          <div className="space-y-1 mb-8">
            <div className="flex items-center">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                Sizing Studio
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Sizing Chart Setup</h1>
            <p className="text-sm text-gray-500">Create and manage sizing charts with measurements in inches and centimeters.</p>
          </div>
          <hr className="-mx-3 lg:-mx-6 border-t border-foreground/50" />
        </div>
      </div>

      <main className="flex-1 px-3 lg:px-6 pt-4 pb-24 bg-gray-100">
        <div className="max-w-6xl mx-auto pt-4">
          <SizeChartsManager />
        </div>
      </main>

      <div className="border-t border-gray-400" />
      <Footer />
    </div>
  );
};

export default SizeCharts;
