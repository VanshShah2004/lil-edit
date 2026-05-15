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
  ChevronRight,
  Shield,
  Tag,
  Layers,
  Box,
  Image as ImageIcon
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
      
      <main className="flex-1 pt-[160px] md:pt-[128px] flex flex-col md:flex-row relative min-h-[calc(100vh-160px)]">
        
        {/* LEFT COLUMN - Product List */}
        <aside className={`w-full md:w-[350px] lg:w-[400px] border-r border-border/50 bg-white flex flex-col shrink-0 md:sticky md:top-[128px] md:h-[calc(100vh-128px)] transition-transform duration-300 md:translate-x-0 ${isMobileDetailView ? "-translate-x-full md:translate-x-0 hidden md:flex" : "translate-x-0 flex"}`}>
          <div className="p-4 border-b border-border/40">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-bold">Catalog</h2>
              <Link to="/admin/add-product" className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors">
                <Plus size={18} />
              </Link>
            </div>
            
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Find product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border/50 bg-[#F9F8FA] text-xs outline-none focus:border-primary/30 transition-all"
              />
            </div>

            <div className="flex gap-1 bg-[#F9F8FA] p-1 rounded-xl border border-border/40">
              {(["ALL", "PUBLISHED", "DRAFT"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
                    filterStatus === status 
                    ? "bg-white text-primary shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
            {loading ? (
              <div className="p-8 text-center text-xs font-bold text-muted-foreground animate-pulse">Syncing Database...</div>
            ) : filteredProducts.map((p) => (
              <button
                key={`${p.status}-${p.id}`}
                onClick={() => handleProductSelect(p)}
                className={`w-full text-left p-3 rounded-2xl transition-all flex gap-3 group ${
                  selectedProduct?.id === p.id 
                  ? "bg-primary/5 border border-primary/20 shadow-sm" 
                  : "hover:bg-secondary/50 border border-transparent"
                }`}
              >
                <div className="w-12 h-16 rounded-lg bg-secondary flex-shrink-0 overflow-hidden relative border border-border/30">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-muted-foreground/30 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  )}
                  <div className={`absolute top-1 left-1 w-2 h-2 rounded-full ${p.status === "PUBLISHED" ? "bg-emerald-500" : "bg-amber-500"}`} />
                </div>
                <div className="flex-1 min-w-0 py-0.5">
                  <h3 className={`text-xs font-bold truncate ${selectedProduct?.id === p.id ? "text-primary" : "text-foreground"}`}>
                    {p.title}
                  </h3>
                  <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 uppercase tracking-tighter">
                    {p.base_sku}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] font-bold">₹{p.price.toLocaleString()}</span>
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${p.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT COLUMN - Detailed View */}
        <section className={`flex-1 bg-[#FCFBFE] pb-32 transition-transform duration-300 md:translate-x-0 ${isMobileDetailView ? "block translate-x-0" : "hidden md:block translate-x-full md:translate-x-0"}`}>
          
          {/* Mobile Back Button */}
          <div className="md:hidden p-4 sticky top-[160px] bg-[#FCFBFE]/90 backdrop-blur-md z-20 flex items-center gap-4 border-b border-border/40 mb-4">
            <button 
              onClick={() => setIsMobileDetailView(false)}
              className="p-2 bg-white rounded-full shadow-sm border border-border/50 text-primary"
            >
              <ArrowLeft size={18} />
            </button>
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Back to List</span>
          </div>

          <AnimatePresence mode="wait">
            {selectedProduct ? (
              <motion.div
                key={selectedProduct.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="p-6 lg:p-10 max-w-5xl mx-auto"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
                  
                  {/* Left: Images */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="aspect-[3/4] bg-white rounded-[2.5rem] overflow-hidden border border-border/60 shadow-xl shadow-primary/5 group">
                      {selectedProduct.image_url ? (
                        <img 
                          src={selectedProduct.image_url} 
                          alt={selectedProduct.title} 
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/10">
                          <Package size={80} />
                          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground/30">No Image Preview</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-4 gap-3">
                      {(selectedProduct.status === "PUBLISHED" ? selectedProduct.product_images : selectedProduct.draft_product_images)?.slice(1, 5).map((img: any, i: number) => (
                        <div key={i} className="aspect-square bg-white rounded-2xl border border-border/40 overflow-hidden shadow-sm">
                          <img src={img.image_url} className="w-full h-full object-cover opacity-60 hover:opacity-100 transition-opacity" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Info */}
                  <div className="lg:col-span-7 space-y-8">
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <Badge variant="outline" className={`border-none px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full ${selectedProduct.status === "PUBLISHED" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>
                          {selectedProduct.status === "PUBLISHED" ? "Live on Store" : "Pending Draft"}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground/60 font-bold uppercase tracking-widest">{selectedProduct.base_sku}</span>
                      </div>
                      
                      <h1 className="text-3xl lg:text-4xl font-display font-medium text-foreground tracking-tight leading-tight">
                        {selectedProduct.title}
                      </h1>
                      
                      <div className="mt-6 flex items-baseline gap-4">
                        <span className="text-3xl font-bold text-primary">₹{selectedProduct.price.toLocaleString()}</span>
                        {selectedProduct.original_price && selectedProduct.original_price > selectedProduct.price && (
                          <span className="text-xl text-muted-foreground line-through decoration-primary/30 decoration-2">₹{selectedProduct.original_price.toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 lg:gap-6 py-6 lg:py-8 border-y border-border/40">
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                          <Tag size={10} /> Category
                        </p>
                        <p className="text-xs font-bold text-foreground">{selectedProduct.category}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                          <Shield size={10} /> Brand
                        </p>
                        <p className="text-xs font-bold text-foreground">{selectedProduct.brand}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                          <Layers size={10} /> Fabric
                        </p>
                        <p className="text-xs font-bold text-foreground">{selectedProduct.fabric || "N/A"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                          <Box size={10} /> Current Stock
                        </p>
                        <p className={`text-xs font-bold ${selectedProduct.stock > 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {selectedProduct.stock} Units
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 pt-4">
                      {selectedProduct.status === "PUBLISHED" && (
                        <Link
                          to={`/collections/${selectedProduct.category_slug}/product/${selectedProduct.slug}`}
                          className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-6 py-4 bg-secondary text-primary rounded-2xl font-bold text-[11px] uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95"
                        >
                          <Eye size={16} /> View Store
                        </Link>
                      )}
                      <button className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-6 py-4 bg-primary text-white rounded-2xl font-bold text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:brightness-110 transition-all active:scale-95">
                        <Edit3 size={16} /> Edit Product
                      </button>
                      <button className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all">
                        <Trash2 size={20} />
                      </button>
                    </div>

                    {selectedProduct.description_points && selectedProduct.description_points.length > 0 && (
                      <div className="bg-white rounded-3xl border border-border/40 p-6 space-y-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary">Product Highlights</h4>
                        <ul className="space-y-3">
                          {selectedProduct.description_points.map((pt, i) => (
                            <li key={i} className="flex gap-3 text-xs text-muted-foreground leading-relaxed italic">
                              <span className="text-primary font-bold">•</span> {pt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30">
                <Package size={60} strokeWidth={1} />
                <p className="mt-4 text-xs font-bold uppercase tracking-widest">Select a product</p>
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
