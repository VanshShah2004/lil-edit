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
  AlertCircle,
  MoreVertical,
  ArrowUpDown
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import UserNavbar from "@/components/home/UserNavbar";
import Navbar from "@/components/layout/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface ProductItem {
  id: string;
  title: string;
  base_sku: string;
  category: string;
  price: number;
  status: "DRAFT" | "PUBLISHED";
  slug: string;
  category_slug: string;
  created_at: string;
  image_url?: string;
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
      // Fetch published products
      const { data: published, error: pubError } = await supabase
        .from("products")
        .select("id, title, base_sku, category, category_slug, price, slug, created_at");
      
      if (pubError) throw pubError;

      // Fetch draft products
      const { data: drafts, error: draftError } = await supabase
        .from("draft_products")
        .select("id, title, base_sku, category, category_slug, price, slug, created_at");

      if (draftError) throw draftError;

      // Combine and tag
      const all: ProductItem[] = [
        ...(published?.map(p => ({ ...p, status: "PUBLISHED" as const })) ?? []),
        ...(drafts?.map(d => ({ ...d, status: "DRAFT" as const })) ?? [])
      ];

      // Fetch primary images for each product (optional optimization: join in SQL)
      // For now, we'll just show icons if no images, or fetch them if needed.
      
      setProducts(all);
    } catch (err) {
      console.error("Error fetching products:", err);
      toast.error("Failed to load products");
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
      const table = status === "PUBLISHED" ? "products" : "draft_products";
      const { error } = await supabase.from(table).delete().eq("id", id);
      
      if (error) throw error;
      
      toast.success("Product deleted successfully");
      setProducts(prev => prev.filter(p => p.id !== id));
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
                  Inventory Management
                </span>
                <div className="h-px w-8 bg-primary/20" />
              </div>
              <h1 className="text-4xl font-display font-medium text-foreground tracking-tight">
                Catalog Studio
              </h1>
              <p className="text-muted-foreground mt-2 font-body text-sm">
                Manage your drafts and live product listings.
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
                New Product
              </Link>
            </motion.div>
          </div>

          {/* Controls Bar */}
          <div className="bg-white rounded-[2rem] border border-border/60 shadow-[0_8px_40px_rgb(0,0,0,0.04)] p-4 md:p-6 mb-8">
            <div className="flex flex-col lg:flex-row gap-4 items-center">
              {/* Search */}
              <div className="relative flex-1 w-full group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="Search by title or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/40 focus:ring-4 focus:ring-primary/5 outline-none transition-all font-body text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-3 w-full lg:w-auto">
                {/* Status Filter */}
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

                {/* Sort Dropdown */}
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

          {/* Product List */}
          <div className="space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary/60">Scanning Catalog...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white rounded-[2rem] border border-dashed border-border/60 p-20 text-center">
                <div className="w-20 h-20 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Package className="w-10 h-10 text-muted-foreground/30" />
                </div>
                <h3 className="text-xl font-display font-medium text-foreground">No products found</h3>
                <p className="text-muted-foreground mt-2 max-w-xs mx-auto text-sm">
                  We couldn't find any products matching your current filters.
                </p>
                <button 
                  onClick={() => {setSearchTerm(""); setFilterStatus("ALL");}}
                  className="mt-6 text-primary font-bold text-[10px] uppercase tracking-widest hover:underline"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product, idx) => (
                  <motion.div
                    key={`${product.status}-${product.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                    className="group bg-white rounded-3xl border border-border/60 hover:border-primary/30 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all p-4 md:p-6"
                  >
                    <div className="flex items-center gap-6">
                      {/* Product Visual */}
                      <div className="hidden sm:flex w-20 h-20 bg-[#F9F8FA] rounded-2xl items-center justify-center border border-border/40 shrink-0 group-hover:scale-105 transition-transform duration-500">
                        <Package className="w-8 h-8 text-muted-foreground/20" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          {product.status === "PUBLISHED" ? (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-bold uppercase tracking-wider border border-emerald-100">
                              <CheckCircle2 size={10} /> Live
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-bold uppercase tracking-wider border border-amber-100">
                              <Clock size={10} /> Draft
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">
                            {product.base_sku}
                          </span>
                        </div>
                        <h3 className="text-lg font-display font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {product.title}
                        </h3>
                        <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                          <span>{product.category}</span>
                          <div className="w-1 h-1 rounded-full bg-border" />
                          <span className="text-foreground">₹{product.price.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {product.status === "PUBLISHED" && (
                          <Link
                            to={`/collections/${product.category_slug}/product/${product.slug}`}
                            className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                            title="View Live"
                          >
                            <Eye size={18} />
                          </Link>
                        )}
                        <button
                          className="p-2.5 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                          title="Edit Product"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id, product.status)}
                          className="p-2.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Delete Product"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ManageProducts;
