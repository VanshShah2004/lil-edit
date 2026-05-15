import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  Eye, 
  Plus, 
  ChevronRight, 
  Package, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  Heart,
  ShoppingBag
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
  status: "DRAFT" | "PUBLISHED";
  slug: string;
  created_at: string;
  image_url?: string;
  brand: string;
  stock: number;
}

const ManageProducts = () => {
  const { user, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "DRAFT" | "PUBLISHED">("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "price-high" | "price-low" | "title">("newest");

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const base = getBackendBaseUrl();
      const res = await fetch(`${base}/api/products`);
      if (!res.ok) throw new Error("Failed to fetch products");
      
      const data = await res.json();
      
      // Flatten the backend response { published: [], drafts: [] }
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
      ];
      
      setProducts(all);
    } catch (err) {
      console.error("Error fetching products:", err);
      toast.error("Failed to load products from backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async (id: string, status: "DRAFT" | "PUBLISHED") => {
    if (!confirm("Are you sure you want to delete this product? This action cannot be undone.")) return;

    try {
      // For now, we still use Supabase directly for deletion as we don't have a backend DELETE route yet
      // Or we can just prompt the user to implement it. I'll stick to a placeholder for now to be safe.
      toast.info("Delete functionality coming soon to backend.");
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete product");
    }
  };

  const filteredProducts = products
    .filter(p => {
      const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.base_sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "ALL" || p.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "price-high") return b.price - a.price;
      if (sortBy === "price-low") return a.price - b.price;
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return 0;
    });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FDFCFD] selection:bg-primary/20 flex flex-col">
      {user ? <UserNavbar /> : <Navbar />}
      
      <main className="flex-1 pt-[160px] md:pt-[128px] pb-24 px-4 sm:px-8 lg:px-12 xl:px-20">
        <div className="mx-auto max-w-7xl">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
                  Admin Dashboard
                </span>
                <div className="h-px w-8 bg-primary/20" />
              </div>
              <h1 className="text-4xl font-display font-medium text-foreground tracking-tight">
                Manage Inventory
              </h1>
              <p className="text-muted-foreground mt-2 font-body text-sm">
                Real-time overview of your store's catalog.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Link
                to="/admin/add-product"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-primary text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-primary/20 active:scale-95"
              >
                <Plus size={16} strokeWidth={3} />
                Add New Product
              </Link>
            </motion.div>
          </div>

          {/* Controls Bar */}
          <div className="bg-white rounded-[2rem] border border-border/60 shadow-[0_8px_40px_rgb(0,0,0,0.04)] p-4 md:p-6 mb-8">
            <div className="flex flex-col lg:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="Search by title, SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/40 focus:ring-4 focus:ring-primary/5 outline-none transition-all font-body text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                <div className="flex bg-[#F9F8FA] p-1 rounded-xl border border-border/50">
                  {(["ALL", "PUBLISHED", "DRAFT"] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(status)}
                      className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                        filterStatus === status 
                        ? "bg-white text-primary shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-[#F9F8FA] border border-border/50 rounded-xl px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="title">Alphabetical</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="price-low">Price: Low to High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Product Cards Grid (Wishlist Style) */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary/60">Fetching from Backend...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-[2rem] border border-dashed border-border/60 p-20 text-center">
              <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-display font-medium text-foreground">No matches found</h3>
              <button onClick={() => {setSearchTerm(""); setFilterStatus("ALL");}} className="mt-4 text-primary font-bold text-[10px] uppercase tracking-widest">Clear Filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product, idx) => (
                  <motion.div
                    key={`${product.status}-${product.id}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                  >
                    <Card className="bg-white border border-gray-200 border-l-8 border-l-primary rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 h-full group">
                      <CardContent className="p-4 flex gap-4 h-full relative">
                        {/* IMAGE (Wishlist Style) */}
                        <div className="w-24 sm:w-32 flex-shrink-0 relative">
                          <div className="aspect-[3/4] overflow-hidden rounded-xl bg-gray-100">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.title}
                                className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                                <Package size={40} />
                              </div>
                            )}
                          </div>
                          <div className="absolute top-2 left-2">
                             {product.status === "PUBLISHED" ? (
                              <Badge className="bg-emerald-500 text-white border-none text-[8px] uppercase tracking-tighter">Live</Badge>
                            ) : (
                              <Badge className="bg-amber-500 text-white border-none text-[8px] uppercase tracking-tighter">Draft</Badge>
                            )}
                          </div>
                        </div>

                        {/* DETAILS */}
                        <div className="flex-1 flex flex-col min-w-0 py-1">
                          <div className="mb-2">
                            <h2 className="text-base font-bold text-gray-900 leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                              {product.title}
                            </h2>
                            <p className="text-[10px] font-mono text-muted-foreground/60 tracking-wider mt-1 uppercase">
                              {product.base_sku}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 text-[9px] px-2 py-0.5 rounded-md font-bold">
                              {product.category}
                            </Badge>
                            <Badge variant="secondary" className="bg-teal-50 text-teal-700 border-teal-100 text-[9px] px-2 py-0.5 rounded-md font-bold">
                              Stock: {product.stock}
                            </Badge>
                          </div>

                          <div className="mt-auto pt-4 flex items-end justify-between">
                            <div className="flex flex-col">
                              <span className="text-lg font-bold text-primary">₹{product.price.toLocaleString()}</span>
                              <span className="text-[10px] text-muted-foreground">Original Price: ₹{product.price.toLocaleString()}</span>
                            </div>
                            
                            <div className="flex gap-2">
                              {product.status === "PUBLISHED" && (
                                <Link
                                  to={`/collections/${product.category_slug}/product/${product.slug}`}
                                  className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                                  title="View"
                                >
                                  <Eye size={14} />
                                </Link>
                              )}
                              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary text-amber-600 hover:bg-amber-500 hover:text-white transition-all shadow-sm">
                                <Edit3 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDelete(product.id, product.status)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary text-red-600 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ManageProducts;
