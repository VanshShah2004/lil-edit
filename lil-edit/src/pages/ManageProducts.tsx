import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  Edit3, 
  Trash2, 
  Eye, 
  Plus, 
  Package, 
  ArrowLeft,
  Image as ImageIcon,
  FileText,
  Boxes,
  Activity
} from "lucide-react";
import { getBackendBaseUrl } from "@/lib/backend";
import UserNavbar from "@/components/home/UserNavbar";
import Navbar from "@/components/layout/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface ProductImage {
  id: string;
  image_url: string;
  alt_text?: string;
  is_primary?: boolean;
  sort_order?: number;
  variant_id: string | null;
}

interface ProductVariant {
  id: string;
  color_name: string;
  color_hex: string;
  variant_sku: string;
  stock: number;
  sort_order?: number;
}

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
  product_images?: ProductImage[];
  draft_product_images?: ProductImage[];
  product_variants?: ProductVariant[];
  draft_product_variants?: ProductVariant[];
  image_url?: string;
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
  const [activeImageTab, setActiveImageTab] = useState<string>("Global");

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
          image_url: p.product_images?.find((i: ProductImage) => !i.variant_id)?.image_url
            ?? p.product_images?.[0]?.image_url
        })) ?? []),
        ...(data.drafts?.map((d: any) => ({
          ...d,
          status: "DRAFT" as const,
          image_url: d.draft_product_images?.find((i: ProductImage) => !i.variant_id)?.image_url
            ?? d.draft_product_images?.[0]?.image_url
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

  useEffect(() => { fetchProducts(); }, []);

  // Reset image studio state when product changes
  useEffect(() => {
    if (!selectedProduct) return;
    setActiveImageTab("Global");
    const allImages: ProductImage[] = selectedProduct.status === "PUBLISHED"
      ? selectedProduct.product_images ?? []
      : selectedProduct.draft_product_images ?? [];
    const firstGlobal = allImages.find(i => !i.variant_id)?.image_url ?? null;
    setActiveImage(firstGlobal);
  }, [selectedProduct?.id]);

  const handleProductSelect = (product: ProductItem) => {
    setSelectedProduct(product);
    setIsMobileDetailView(true);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.base_sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "ALL" || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] selection:bg-black/5 flex flex-col font-sans">
      {user ? <UserNavbar /> : <Navbar />}

      {/* PAGE HEADER */}
      <div className="pt-[160px] md:pt-[128px] px-8 lg:px-12 bg-white border-b border-gray-100 pb-8">
        <div className="max-w-screen-2xl mx-auto">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Administration / Store Catalog</p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Inventory Management</h1>
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col md:flex-row relative min-h-[calc(100vh-250px)]">

        {/* LEFT COLUMN — Product List (25%) */}
        <aside className={`w-full md:w-[25%] border-r border-gray-100 bg-white flex flex-col shrink-0 md:sticky md:top-[128px] transition-transform duration-300 md:translate-x-0 ${isMobileDetailView ? "-translate-x-full md:translate-x-0 hidden md:flex" : "translate-x-0 flex"}`}>
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-md bg-gray-50/50 outline-none focus:border-gray-900 transition-all font-medium"
                />
              </div>
              <Link
                to="/admin/add-product"
                className="p-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-all shrink-0"
                title="Create New Entry"
              >
                <Plus size={16} />
              </Link>
            </div>
            <div className="flex bg-gray-50 p-1 rounded-md border border-gray-100">
              {(["ALL", "PUBLISHED", "DRAFT"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`flex-1 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${filterStatus === status ? "bg-white text-gray-900 shadow-sm border border-gray-100" : "text-gray-400 hover:text-gray-600"}`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar py-2">
            {loading ? (
              <div className="p-12 text-center text-[10px] font-bold uppercase tracking-widest text-gray-300">Loading Records...</div>
            ) : filteredProducts.map((p) => (
              <button
                key={`${p.status}-${p.id}`}
                onClick={() => handleProductSelect(p)}
                className={`w-full text-left px-6 py-4 transition-all flex gap-4 ${selectedProduct?.id === p.id ? "bg-gray-50 border-r-4 border-r-gray-900" : "hover:bg-gray-50/50"}`}
              >
                <div className="w-10 h-12 bg-gray-100 rounded border border-gray-200 flex-shrink-0 overflow-hidden relative">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-gray-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-xs font-bold truncate leading-tight ${selectedProduct?.id === p.id ? "text-gray-900" : "text-gray-600"}`}>{p.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-gray-400 font-mono font-medium">{p.base_sku}</span>
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${p.status === "PUBLISHED" ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600"}`}>{p.status}</span>
                  </div>
                  <p className="text-[10px] font-bold text-gray-900 mt-1">₹{p.price.toLocaleString()}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT COLUMN — Detail View (75%) */}
        <section className={`md:w-[75%] bg-white pb-32 transition-all duration-300 md:translate-x-0 ${isMobileDetailView ? "block translate-x-0" : "hidden md:block translate-x-full md:translate-x-0"}`}>

          {/* Mobile Back */}
          <div className="md:hidden p-6 sticky top-[160px] bg-white border-b border-gray-100 z-20 flex items-center justify-between">
            <button onClick={() => setIsMobileDetailView(false)} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-900 transition-all">
              <ArrowLeft size={16} /> Back to Catalog
            </button>
            <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-widest">{selectedProduct?.status}</Badge>
          </div>

          <AnimatePresence mode="wait">
            {selectedProduct ? (
              <motion.div
                key={selectedProduct.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-8 lg:p-16 max-w-5xl mx-auto"
              >
                <div className="space-y-16">

                  {/* Summary Row */}
                  <div className="flex flex-col md:flex-row justify-between items-start gap-12">
                    <div className="flex-1 space-y-6">
                      <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{selectedProduct.title}</h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-12 gap-y-6 border-t border-b border-gray-100 py-6">
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Master SKU</p>
                          <p className="text-xs font-bold text-gray-900 font-mono">{selectedProduct.base_sku}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Brand House</p>
                          <p className="text-xs font-bold text-gray-900">{selectedProduct.brand}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Base Price (INR)</p>
                          <p className="text-xs font-bold text-gray-900">₹{selectedProduct.price.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>

                    <div className="w-full md:w-auto flex flex-col gap-3">
                      <button className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white rounded font-bold text-[10px] uppercase tracking-widest hover:bg-gray-800 transition-all">
                        <Edit3 size={14} /> Update Entry
                      </button>
                      <button className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 text-gray-600 rounded font-bold text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all">
                        <Eye size={14} /> View Store Record
                      </button>
                      <button className="w-full flex items-center justify-center gap-2 px-6 py-3 text-red-500 rounded font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all">
                        <Trash2 size={14} /> Delete Permanent
                      </button>
                    </div>
                  </div>

                  {/* Documentation Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">

                    {/* — IMAGE STUDIO — */}
                    <div className="lg:col-span-4 space-y-4">
                      {/* Main Preview */}
                      <div className="aspect-[3/4] border border-gray-100 bg-gray-50/50 rounded-sm overflow-hidden flex items-center justify-center">
                        {activeImage ? (
                          <img src={activeImage} className="w-full h-full object-cover" alt={selectedProduct.title} />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-gray-200">
                            <ImageIcon size={32} />
                            <span className="text-[9px] font-bold uppercase tracking-widest">No Image</span>
                          </div>
                        )}
                      </div>

                      {/* Variant Tabs + Thumbnails */}
                      {(() => {
                        const allImages: ProductImage[] = selectedProduct.status === "PUBLISHED"
                          ? selectedProduct.product_images ?? []
                          : selectedProduct.draft_product_images ?? [];
                        const variants: ProductVariant[] = selectedProduct.status === "PUBLISHED"
                          ? selectedProduct.product_variants ?? []
                          : selectedProduct.draft_product_variants ?? [];

                        const tabs = ["Global", ...variants.map(v => v.color_name)];

                        const getTabImages = (tab: string): ProductImage[] => {
                          if (tab === "Global") return allImages.filter(img => !img.variant_id);
                          const variant = variants.find(v => v.color_name === tab);
                          return variant ? allImages.filter(img => img.variant_id === variant.id) : [];
                        };

                        const tabImages = getTabImages(activeImageTab);

                        return (
                          <div className="space-y-3">
                            {/* Tab Bar */}
                            <div className="flex flex-wrap gap-1">
                              {tabs.map((tab) => {
                                const variant = variants.find(v => v.color_name === tab);
                                return (
                                  <button
                                    key={tab}
                                    onClick={() => {
                                      setActiveImageTab(tab);
                                      setActiveImage(getTabImages(tab)[0]?.image_url ?? null);
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded border transition-all ${activeImageTab === tab ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-100 hover:border-gray-300"}`}
                                  >
                                    {variant && (
                                      <div className="w-2 h-2 rounded-full border border-white/20" style={{ backgroundColor: variant.color_hex }} />
                                    )}
                                    {tab}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Thumbnail Strip */}
                            <div className="flex flex-wrap gap-2">
                              {tabImages.length > 0 ? tabImages.map((img, i) => (
                                <button
                                  key={i}
                                  onClick={() => setActiveImage(img.image_url)}
                                  className={`w-12 h-16 border bg-gray-50 shrink-0 overflow-hidden transition-all ${activeImage === img.image_url ? "border-gray-900" : "border-gray-100 opacity-50 hover:opacity-80"}`}
                                >
                                  <img src={img.image_url} className="w-full h-full object-cover" />
                                </button>
                              )) : (
                                <p className="text-[9px] text-gray-300 font-bold uppercase tracking-widest py-2">
                                  No images for {activeImageTab === "Global" ? "global gallery" : `${activeImageTab} variant`}.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* — SPECS & MATRIX — */}
                    <div className="lg:col-span-8 space-y-12">

                      {/* Technical Specifications */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-gray-400" />
                          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Technical Specifications</h3>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-8 gap-x-4">
                          {[
                            { label: "Category", value: selectedProduct.category },
                            { label: "Gender", value: selectedProduct.gender || "N/A" },
                            { label: "Fabrication", value: selectedProduct.fabric || "N/A" },
                            { label: "Silhouette", value: selectedProduct.fit || "N/A" },
                            { label: "Occasion", value: selectedProduct.occasion || "N/A" },
                            { label: "Maintenance", value: selectedProduct.care || "N/A" }
                          ].map((item, i) => (
                            <div key={i} className="space-y-1">
                              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{item.label}</p>
                              <p className="text-[11px] font-bold text-gray-900">{item.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Inventory Matrix */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                          <Boxes size={14} className="text-gray-400" />
                          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Inventory Distribution Matrix</h3>
                        </div>
                        <div className="border border-gray-100 rounded-sm overflow-hidden">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-gray-50 border-b border-gray-100">
                              <tr>
                                <th className="px-6 py-3 font-bold text-gray-400 uppercase tracking-wider">Variant Label</th>
                                <th className="px-6 py-3 font-bold text-gray-400 uppercase tracking-wider">Unique SKU</th>
                                <th className="px-6 py-3 font-bold text-gray-400 uppercase tracking-wider text-right">Units On-Hand</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {(selectedProduct.status === "PUBLISHED" ? selectedProduct.product_variants : selectedProduct.draft_product_variants)?.map((v, i) => (
                                <tr key={i} className="hover:bg-gray-50/30">
                                  <td className="px-6 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full border border-gray-100" style={{ backgroundColor: v.color_hex }} />
                                      <span className="font-bold">{v.color_name}</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-3 font-mono text-[10px] text-gray-400">{v.variant_sku}</td>
                                  <td className="px-6 py-3 font-bold text-right text-gray-900">{v.stock}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-50/50 font-bold border-t border-gray-100">
                              <tr>
                                <td colSpan={2} className="px-6 py-3 text-gray-400 uppercase tracking-wider text-[10px]">Consolidated Total</td>
                                <td className="px-6 py-3 text-right text-gray-900">{selectedProduct.stock}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* Catalogue Highlights */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                          <Activity size={14} className="text-gray-400" />
                          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Catalogue Highlights</h3>
                        </div>
                        <div className="space-y-3">
                          {selectedProduct.description_points?.length ? (
                            selectedProduct.description_points.map((pt, i) => (
                              <div key={i} className="flex gap-3 text-[11px] leading-relaxed text-gray-500 font-medium">
                                <span className="text-gray-900 font-bold shrink-0">0{i + 1}.</span>
                                <p>{pt}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-[11px] text-gray-300 italic">No highlights provided for this product.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-20 text-center opacity-30">
                <Package size={32} />
                <p className="mt-4 text-[10px] font-bold uppercase tracking-widest">Select Record</p>
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
