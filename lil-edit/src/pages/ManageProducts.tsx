import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Edit3,
  Trash2,
  Eye,
  Plus,
  Package,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Shield,
  Tag,
  Layers,
  Box,
  Image as ImageIcon,
  Zap,
  Sparkles,
  Info
} from "lucide-react";
import { getBackendBaseUrl } from "@/lib/backend";
import UserNavbar from "@/components/home/UserNavbar";
import Navbar from "@/components/layout/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProductItem {
  id: string;
  title: string;
  base_sku: string;
  category: string;
  category_slug: string;
  price: number;
  original_price?: number;
  status: "DRAFT" | "PUBLISHED";
  slug: string;
  created_at: string;
  brand: string;
  stock: number;
  fabric?: string;
  fit?: string;
  occasion?: string;
  care?: string;
  description_points?: string[];
  gender?: string;
  product_images?: any[];
  draft_product_images?: any[];
  product_variants?: any[];
  draft_product_variants?: any[];
  image_url?: string; // Derived
}

const ManageProducts = () => {
  const { user, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "DRAFT" | "PUBLISHED">("ALL");
  const [isMobileDetailView, setIsMobileDetailView] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const base = getBackendBaseUrl();
      const res = await fetch(`${base}/api/products`);
      if (!res.ok) throw new Error("Failed to fetch products");

      const data = await res.json();

      const all: ProductItem[] = [
        ...(data.published?.map((p: any) => ({
          ...p,
          status: "PUBLISHED" as const,
          image_url: p.product_images?.[0]?.image_url
        })) ?? []),
        ...(data.drafts?.map((d: any) => ({
          ...d,
          status: "DRAFT" as const,
          image_url: d.draft_product_images?.[0]?.image_url
        })) ?? [])
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setProducts(all);
      if (all.length > 0) {
        setSelectedProduct(all[0]);
        setActiveImage(all[0].image_url || null);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      toast.error("Failed to load catalog");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      setActiveImage(selectedProduct.image_url || null);
    }
  }, [selectedProduct]);

  const handleProductSelect = (product: ProductItem) => {
    setSelectedProduct(product);
    setIsMobileDetailView(true);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.base_sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "ALL" || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FDFCFD] selection:bg-primary/20 flex flex-col">
      {user ? <UserNavbar /> : <Navbar />}

      {/* MAIN HEADING - ABOVE THE FOLD */}
      <div className="pt-[160px] md:pt-[128px] px-6 lg:px-12 bg-white border-b border-border/40 pb-6">
        <div className="max-w-screen-2xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col"
          >
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mb-2">Catalog Studio</span>
            <h1 className="text-4xl lg:text-5xl font-display font-black tracking-tight text-foreground">Inventory Management</h1>
          </motion.div>
        </div>
      </div>

      <main className="flex-1 flex flex-col md:flex-row relative min-h-[calc(100vh-280px)]">

        {/* LEFT COLUMN - Product List (25%) */}
        <aside className={`w-full md:w-[25%] border-r border-border/50 bg-white flex flex-col shrink-0 md:sticky md:top-[128px] transition-transform duration-300 md:translate-x-0 ${isMobileDetailView ? "-translate-x-full md:translate-x-0 hidden md:flex" : "translate-x-0 flex"}`}>
          <div className="p-5 border-b border-border/40 bg-gradient-to-b from-white to-[#F9F8FA]/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Find product..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-border/40 bg-white shadow-sm text-xs outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all font-medium"
                />
              </div>
              <Link 
                to="/admin/add-product" 
                className="p-2.5 bg-primary text-white rounded-2xl hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95 shrink-0"
                title="Add New Product"
              >
                <Plus size={20} strokeWidth={2.5} />
              </Link>
            </div>

            <div className="flex gap-1 bg-[#F1F0F5] p-1.5 rounded-2xl border border-border/20">
              {(["ALL", "PUBLISHED", "DRAFT"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === status
                    ? "bg-white text-primary shadow-md shadow-black/5"
                    : "text-muted-foreground/60 hover:text-foreground"
                    }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2 bg-[#F9F8FA]/30">
            {loading ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">Syncing Catalog</p>
              </div>
            ) : filteredProducts.map((p) => (
              <button
                key={`${p.status}-${p.id}`}
                onClick={() => handleProductSelect(p)}
                className={`w-full text-left p-4 rounded-3xl transition-all flex gap-4 group relative overflow-hidden ${selectedProduct?.id === p.id
                  ? "bg-white border-primary/30 shadow-xl shadow-primary/5 border-2"
                  : "bg-white/50 hover:bg-white border-transparent border-2 hover:border-border/60 hover:shadow-lg hover:shadow-black/5"
                  }`}
              >
                {selectedProduct?.id === p.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                )}
                <div className="w-14 h-18 rounded-2xl bg-secondary flex-shrink-0 overflow-hidden relative border border-border/20">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-muted-foreground/20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  )}
                  <div className={`absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${p.status === "PUBLISHED" ? "bg-emerald-500" : "bg-amber-500"}`} />
                </div>
                <div className="flex-1 min-w-0 py-0.5">
                  <h3 className={`text-xs font-black truncate tracking-tight ${selectedProduct?.id === p.id ? "text-primary" : "text-foreground"}`}>
                    {p.title}
                  </h3>
                  <p className="text-[10px] text-muted-foreground/40 font-mono mt-1 uppercase tracking-tighter font-bold">
                    {p.base_sku}
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs font-black text-foreground">₹{p.price.toLocaleString()}</span>
                    <Badge className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border-none ${p.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                      {p.status}
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT COLUMN - Detailed View (75%) */}
        <section className={`md:w-[75%] bg-white pb-32 transition-all duration-500 ease-in-out md:translate-x-0 ${isMobileDetailView ? "block translate-x-0" : "hidden md:block translate-x-full md:translate-x-0"}`}>

          {/* Mobile Back Button */}
          <div className="md:hidden p-5 sticky top-[160px] bg-white/90 backdrop-blur-xl z-20 flex items-center gap-4 border-b border-border/40 mb-6">
            <button
              onClick={() => setIsMobileDetailView(false)}
              className="p-3 bg-white rounded-2xl shadow-xl shadow-black/5 border border-border/50 text-primary active:scale-95 transition-all"
            >
              <ArrowLeft size={20} strokeWidth={2.5} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Inventory Management</span>
              <span className="text-xs font-bold text-muted-foreground">Return to List</span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {selectedProduct ? (
              <motion.div
                key={selectedProduct.id}
                initial={{ opacity: 0, x: 30, filter: "blur(10px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -30, filter: "blur(10px)" }}
                transition={{ duration: 0.5, ease: "circOut" }}
                className="p-6 lg:p-12 max-w-6xl mx-auto"
              >
                {/* Premium Layout */}
                <div className="flex flex-col xl:flex-row gap-12 lg:gap-16">

                  {/* Left: Interactive Image Suite */}
                  <div className="xl:w-[45%] space-y-6">
                    <div className="relative aspect-[3.5/4] bg-[#FDFCFD] rounded-[3rem] overflow-hidden border border-border/40 shadow-2xl shadow-primary/10 group cursor-zoom-in">
                      {activeImage ? (
                        <motion.img
                          key={activeImage}
                          initial={{ opacity: 0, scale: 1.1 }}
                          animate={{ opacity: 1, scale: 1 }}
                          src={activeImage}
                          alt={selectedProduct.title}
                          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/10 bg-secondary/20">
                          <Package size={100} strokeWidth={1} />
                          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">No Asset Loaded</p>
                        </div>
                      )}

                      {/* Floating Status Tag */}
                      <div className="absolute top-6 left-6">
                        <div className={`px-4 py-2 rounded-2xl backdrop-blur-xl border flex items-center gap-2 shadow-2xl ${selectedProduct.status === "PUBLISHED" ? "bg-emerald-500/90 border-emerald-400 text-white" : "bg-amber-500/90 border-amber-400 text-white"}`}>
                          {selectedProduct.status === "PUBLISHED" ? <CheckCircle2 size={14} strokeWidth={3} /> : <Clock size={14} strokeWidth={3} />}
                          <span className="text-[10px] font-black uppercase tracking-widest">{selectedProduct.status}</span>
                        </div>
                      </div>

                      {/* Zap Icon for SKU */}
                      <div className="absolute bottom-6 right-6">
                        <div className="p-3 bg-white/90 backdrop-blur-xl rounded-2xl border border-border/40 shadow-2xl text-primary flex items-center gap-2">
                          <Zap size={14} fill="currentColor" />
                          <span className="text-[10px] font-black tracking-widest uppercase">{selectedProduct.base_sku}</span>
                        </div>
                      </div>
                    </div>

                    {/* Editorial Thumbnails */}
                    <div className="flex gap-4 overflow-x-auto no-scrollbar py-2">
                      {[selectedProduct.image_url, ...(selectedProduct.status === "PUBLISHED" ? selectedProduct.product_images : selectedProduct.draft_product_images)?.map(i => i.image_url)]
                        .filter(Boolean)
                        .filter((val, index, self) => self.indexOf(val) === index) // Unique
                        .slice(0, 6)
                        .map((img, i) => (
                          <button
                            key={i}
                            onClick={() => setActiveImage(img)}
                            className={`w-20 h-24 rounded-2xl border-2 overflow-hidden shadow-sm shrink-0 transition-all duration-300 ${activeImage === img ? "border-primary scale-105 shadow-primary/20" : "border-border/40 opacity-50 hover:opacity-100"}`}
                          >
                            <img src={img} className="w-full h-full object-cover" />
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Right: Premium Product Info */}
                  <div className="flex-1 space-y-10">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-primary">
                        <Sparkles size={16} fill="currentColor" className="animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em]">{selectedProduct.brand}</span>
                      </div>

                      <h1 className="text-4xl lg:text-5xl font-display font-black text-foreground tracking-tight leading-[1.1]">
                        {selectedProduct.title}
                      </h1>

                      <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-1">Pricing</span>
                          <div className="flex items-center gap-4">
                            <span className="text-4xl font-black text-primary">₹{selectedProduct.price.toLocaleString()}</span>
                            {selectedProduct.original_price && selectedProduct.original_price > selectedProduct.price && (
                              <span className="text-xl text-muted-foreground/40 line-through decoration-primary/20 decoration-2 font-bold">₹{selectedProduct.original_price.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="h-10 w-px bg-border/40" />
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-1">Available Inventory</span>
                          <div className={`text-xl font-black ${selectedProduct.stock > 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {selectedProduct.stock} <span className="text-[10px] text-muted-foreground/60">units</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Meta Glass Card */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: "Category", value: selectedProduct.category, icon: Tag, color: "bg-purple-50 text-purple-600 border-purple-100" },
                        { label: "Gender", value: selectedProduct.gender || "Unisex", icon: Shield, color: "bg-blue-50 text-blue-600 border-blue-100" },
                        { label: "Fabric", value: selectedProduct.fabric || "Premium", icon: Layers, color: "bg-rose-50 text-rose-600 border-rose-100" },
                        { label: "Fit", value: selectedProduct.fit || "Standard", icon: Box, color: "bg-amber-50 text-amber-600 border-amber-100" }
                      ].map((item, idx) => (
                        <div key={idx} className={`p-4 rounded-[2rem] border transition-all hover:shadow-lg hover:shadow-black/5 ${item.color}`}>
                          <item.icon size={14} className="mb-2" />
                          <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">{item.label}</p>
                          <p className="text-[11px] font-black tracking-tight">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Action Hub */}
                    <div className="flex flex-col sm:flex-row gap-4">
                      {selectedProduct.status === "PUBLISHED" && (
                        <Link
                          to={`/collections/${selectedProduct.category_slug}/product/${selectedProduct.slug}`}
                          className="flex-1 flex items-center justify-center gap-3 px-8 py-5 bg-secondary text-primary rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-primary hover:text-white transition-all shadow-xl shadow-secondary/20 active:scale-[0.98]"
                        >
                          <Eye size={18} strokeWidth={2.5} /> View in Store
                        </Link>
                      )}
                      <button className="flex-1 flex items-center justify-center gap-3 px-8 py-5 bg-primary text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 hover:brightness-110 transition-all active:scale-[0.98]">
                        <Edit3 size={18} strokeWidth={2.5} /> Edit Catalog
                      </button>
                      <button className="p-5 bg-red-50 text-red-500 rounded-[2rem] border border-red-100 hover:bg-red-500 hover:text-white transition-all shadow-xl shadow-red-500/5 active:scale-95">
                        <Trash2 size={22} />
                      </button>
                    </div>

                    {/* Detailed Highlights */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <Info size={16} className="text-primary" />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-foreground">Technical Specifications</h4>
                      </div>

                      <div className="bg-[#F9F8FA] rounded-[3rem] p-8 border border-border/40 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl transition-all group-hover:scale-150" />
                        <ul className="space-y-4 relative z-10">
                          {(selectedProduct.description_points && selectedProduct.description_points.length > 0) ? selectedProduct.description_points.map((pt, i) => (
                            <li key={i} className="flex gap-4 items-start group/li">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0 group-hover/li:scale-150 transition-transform" />
                              <p className="text-xs font-bold text-muted-foreground/80 leading-relaxed italic tracking-tight">
                                {pt}
                              </p>
                            </li>
                          )) : (
                            <p className="text-xs font-bold text-muted-foreground/40 italic">No additional specifications provided for this product.</p>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-20 text-center">
                <div className="w-24 h-24 bg-secondary/30 rounded-full flex items-center justify-center mb-6 animate-bounce">
                  <Package size={40} className="text-primary/40" />
                </div>
                <h3 className="text-2xl font-display font-black text-foreground mb-2">Select a Masterpiece</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">Pick a product from the catalog to view its full technical details and live status.</p>
              </div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ManageProducts;
