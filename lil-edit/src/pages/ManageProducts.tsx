import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Edit3,
  Trash2,
  Download,
  Plus,
  Package,
  ArrowLeft,
  Image as ImageIcon,
  FileText,
  Boxes,
  Activity,
  Zap
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
  sizes?: string[];
  tags?: string[];
  badges?: string[];
  is_featured?: boolean;
  is_new_arrival?: boolean;
  is_bestseller?: boolean;
  is_trending?: boolean;
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

  const handleLaunchProduct = async (product: ProductItem) => {
    if (!window.confirm(`Are you sure you want to launch "${product.title}"?\n\nThis will move the product from Drafts to the Live Catalog and it will become visible to customers.`)) return;

    try {
      const base = getBackendBaseUrl();
      const images = product.status === "DRAFT" ? product.draft_product_images : product.product_images;
      const variants = product.status === "DRAFT" ? product.draft_product_variants : product.product_variants;

      // Construct payload compatible with backend/lib/persistCatalog.ts
      const payload = {
        status: "PUBLISHED",
        name: product.title || "Untitled Product",
        brand: product.brand || "The Lil Edit",
        sku: product.base_sku || "SKU-UNKNOWN",
        slug: product.slug || "",
        categorySlug: product.category_slug || "",
        category: product.category || "General",
        gender: product.gender || "Unisex",
        price: String(product.price ?? 0),
        originalPrice: String(product.original_price ?? ""),
        stock: String(product.stock ?? 0),
        fabric: product.fabric || "",
        fit: product.fit || "",
        occasion: product.occasion || "",
        care: product.care || "",
        descriptionPoints: product.description_points || [],
        tags: product.tags || [],
        selectedSizes: product.sizes || [],
        customBadges: product.badges || [],
        featured: !!product.is_featured,
        newArrival: !!product.is_new_arrival,
        bestseller: !!product.is_bestseller,
        trending: !!product.is_trending,
        // Global images (no variant_id)
        imagePreviews: images?.filter(img => !img.variant_id).map(img => img.image_url) || [],
        // Map variants and their specific images
        selectedColors: variants?.map(v => ({
          name: v.color_name || "Color",
          hex: v.color_hex || "#cccccc",
          sku: v.variant_sku || "",
          stock: Number(v.stock ?? 0),
          images: images?.filter(img => img.variant_id === v.id).map(img => img.image_url) || []
        })) || []
      };

      const res = await fetch(`${base}/api/products/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to launch product");
      }

      toast.success(`"${product.title}" has been successfully launched!`);

      // Refresh the product list and selection
      await fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteProduct = async (product: ProductItem) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${product.title}"?\n\nThis will remove the product, all its variants, and images from the database. This action cannot be undone.`)) return;

    try {
      const base = getBackendBaseUrl();
      const res = await fetch(`${base}/api/products/${product.id}?status=${product.status}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete product");
      }

      toast.success("Product permanently deleted");

      // Update local state
      setProducts(prev => prev.filter(p => p.id !== product.id));
      setSelectedProduct(null);
      setIsMobileDetailView(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownloadPdf = (product: ProductItem) => {
    const allImages: ProductImage[] = (product.status === "PUBLISHED"
      ? product.product_images
      : product.draft_product_images) ?? [];
    const variants: ProductVariant[] = (product.status === "PUBLISHED"
      ? product.product_variants
      : product.draft_product_variants) ?? [];

    // Build grouped image sections
    const globalImages = allImages.filter(img => !img.variant_id);
    const imageSections = [
      { label: "Global Gallery", images: globalImages, hex: null },
      ...variants.map(v => ({
        label: `${v.color_name} Variant`,
        images: allImages.filter(img => img.variant_id === v.id),
        hex: v.color_hex
      }))
    ].filter(s => s.images.length > 0);

    const imageGroupsHtml = imageSections.map(section => `
      <div style="margin-bottom:32px;">
        <div class="section-title" style="display:flex;align-items:center;gap:8px;">
          ${section.hex ? `<span style="width:10px;height:10px;border-radius:50%;background:${section.hex};display:inline-block;border:1px solid rgba(0,0,0,0.1);flex-shrink:0;"></span>` : ''}
          ${section.label}
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
          ${section.images.map(img => `
            <div style="aspect-ratio:3/4;overflow:hidden;border:1px solid #eee;border-radius:4px;">
              <img src="${img.image_url}" style="width:100%;height:100%;object-fit:cover;" alt="${img.alt_text ?? section.label}" />
            </div>
          `).join("")}
        </div>
      </div>`).join("");

    const variantRows = variants.map(v => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span style="width:10px;height:10px;border-radius:50%;background:${v.color_hex};display:inline-block;border:1px solid rgba(0,0,0,0.1);"></span>
            ${v.color_name}
          </span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:11px;color:#888;">${v.variant_sku}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:bold;">${v.stock}</td>
      </tr>`).join("");

    const highlights = (product.description_points ?? []).map((pt, i) => `
      <div style="display:flex;gap:10px;margin-bottom:8px;">
        <span style="font-weight:bold;color:#111;min-width:24px;">0${i + 1}.</span>
        <span style="color:#555;font-size:12px;line-height:1.6;">${pt}</span>
      </div>`).join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Sheet — ${product.title}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; padding: 48px; font-size: 13px; line-height: 1.6; }
          h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; }
          .label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 3px; }
          .value { font-size: 12px; font-weight: 700; color: #111; }
          .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 16px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 32px; margin-bottom: 32px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #f8f8f8; padding: 8px 12px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; }
          .footer { margin-top: 40px; border-top: 1px solid #eee; padding-top: 12px; color: #bbb; font-size: 10px; display: flex; justify-content: space-between; }
          @media print { body { padding: 32px; } img { break-inside: avoid; } }
        </style>
      </head>
      <body>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:20px;margin-bottom:28px;">
          <div>
            <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#999;margin-bottom:6px;">Product Data Sheet</p>
            <h1>${product.title}</h1>
          </div>
          <div style="text-align:right;">
            <div class="label">Status</div>
            <span style="background:${product.status === 'PUBLISHED' ? '#111' : '#e0e0e0'};color:${product.status === 'PUBLISHED' ? '#fff' : '#555'};padding:3px 10px;border-radius:4px;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">${product.status}</span>
          </div>
        </div>

        <div class="grid">
          <div><div class="label">Master SKU</div><div class="value" style="font-family:monospace;">${product.base_sku}</div></div>
          <div><div class="label">Brand</div><div class="value">${product.brand}</div></div>
          <div><div class="label">Selling Price (INR)</div><div class="value">₹${product.price.toLocaleString()}</div></div>
          <div><div class="label">MRP / Original Price</div><div class="value">${product.original_price ? `₹${product.original_price.toLocaleString()}` : '—'}</div></div>
          <div><div class="label">Category</div><div class="value">${product.category}</div></div>
          <div><div class="label">Gender</div><div class="value">${product.gender ?? 'N/A'}</div></div>
          <div><div class="label">Total Stock</div><div class="value">${product.stock} units</div></div>
          <div><div class="label">Sizes</div><div class="value">${product.sizes?.length ? product.sizes.join(', ') : 'N/A'}</div></div>
          <div><div class="label">Fabrication</div><div class="value">${product.fabric ?? 'N/A'}</div></div>
          <div><div class="label">Silhouette</div><div class="value">${product.fit ?? 'N/A'}</div></div>
          <div><div class="label">Occasion</div><div class="value">${product.occasion ?? 'N/A'}</div></div>
          <div><div class="label">Maintenance</div><div class="value">${product.care ?? 'N/A'}</div></div>
        </div>

        <div class="grid">
          <div><div class="label">Tags</div><div class="value">${product.tags?.length ? product.tags.join(', ') : 'None'}</div></div>
          <div><div class="label">Badges</div><div class="value">${product.badges?.length ? product.badges.join(', ') : 'None'}</div></div>
          <div>
            <div class="label">Merchandising Flags</div>
            <div class="value">
              ${[
        product.is_featured ? 'Featured' : '',
        product.is_new_arrival ? 'New Arrival' : '',
        product.is_bestseller ? 'Bestseller' : '',
        product.is_trending ? 'Trending' : ''
      ].filter(Boolean).join(', ') || 'None'}
            </div>
          </div>
          <div><div class="label">Occasion</div><div class="value">${product.occasion ?? 'N/A'}</div></div>
          <div><div class="label">Maintenance</div><div class="value">${product.care ?? 'N/A'}</div></div>
        </div>

        ${variants.length > 0 ? `
        <div class="section-title">Inventory Distribution Matrix</div>
        <table style="margin-bottom:32px;">
          <thead><tr><th>Variant</th><th>SKU</th><th style="text-align:right;">Units</th></tr></thead>
          <tbody>${variantRows}</tbody>
          <tfoot><tr><td colspan="2" style="padding:8px 12px;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;border-top:1px solid #eee;">Consolidated Total</td><td style="padding:8px 12px;text-align:right;font-weight:800;border-top:1px solid #eee;">${product.stock}</td></tr></tfoot>
        </table>` : ''}

        ${imageGroupsHtml ? `
        <div class="section-title">Product Image Assets</div>
        ${imageGroupsHtml}` : ''}

        ${highlights ? `
        <div class="section-title">Catalogue Highlights</div>
        <div>${highlights}</div>` : ''}

        <div class="footer">
          <span>The Lil Edit — Inventory Management</span>
          <span>Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </body>
      </html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
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
            <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: "#B19CD9" }}>Catalog Studio</p>
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
                className="px-8 pt-2 pb-16 lg:px-16 lg:pt-4 lg:pb-20 max-w-5xl mx-auto"
              >
                <div className="space-y-16">

                  {/* Summary Row */}
                  <div className="space-y-8">
                    <div className="flex items-center gap-4">
                      <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{selectedProduct.title}</h2>
                      <Badge className="bg-[#E6E6FA] text-[#4B0082] border-none hover:bg-[#D8BFD8] text-[10px] font-bold uppercase tracking-widest px-3 py-1">
                        {selectedProduct.status}
                      </Badge>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between items-start gap-12">
                      <div className="flex-1">
                        <div className="grid grid-cols-2 gap-x-12 gap-y-8 border-t border-b border-gray-100 py-6">
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Master SKU</p>
                            <p className="text-xs font-bold text-gray-900 font-mono">{selectedProduct.base_sku}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Brand House</p>
                            <p className="text-xs font-bold text-gray-900">{selectedProduct.brand}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Selling Price (INR)</p>
                            <p className="text-xs font-bold text-gray-900">₹{selectedProduct.price.toLocaleString()}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">MRP / Original Price</p>
                            <p className="text-xs font-bold text-gray-900">
                              {selectedProduct.original_price
                                ? `₹${selectedProduct.original_price.toLocaleString()}`
                                : "—"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="w-full md:w-auto flex flex-col gap-3">
                        <div className="flex gap-3">
                          <button className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white rounded font-bold text-[10px] uppercase tracking-widest hover:bg-gray-800 transition-all">
                            <Edit3 size={14} /> Update Entry
                          </button>
                          <button className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 text-gray-600 rounded font-bold text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all" onClick={() => handleDownloadPdf(selectedProduct)}>
                            <Download size={14} /> Download PDF
                          </button>
                        </div>
                        {selectedProduct.status === "DRAFT" && (
                          <button
                            onClick={() => handleLaunchProduct(selectedProduct)}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#B19CD9] text-black rounded font-bold text-[10px] uppercase tracking-widest hover:brightness-105 transition-all shadow-lg shadow-[#B19CD9]/20"
                          >
                            <Zap size={14} /> Launch Product
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteProduct(selectedProduct)}
                          className="w-full flex items-center justify-center gap-2 px-6 py-3 border-2 border-red-500 text-red-500 rounded font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all"
                        >
                          <Trash2 size={14} /> Delete Permanent
                        </button>
                      </div>
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
                            { label: "Sizes", value: selectedProduct.sizes?.length ? selectedProduct.sizes.join(", ") : "N/A" },
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

                      {/* Merchandising Details */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-gray-400" />
                          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Merchandising & Taxonomy</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-8 gap-x-4">
                          <div className="space-y-2">
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Tags</p>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedProduct.tags?.length ? selectedProduct.tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-[9px] font-bold uppercase tracking-widest bg-gray-100 text-gray-600 hover:bg-gray-200 border-none">{tag}</Badge>
                              )) : <span className="text-[11px] font-bold text-gray-900">None</span>}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Badges</p>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedProduct.badges?.length ? selectedProduct.badges.map(badge => (
                                <Badge key={badge} variant="secondary" className="text-[9px] font-bold uppercase tracking-widest bg-gray-900 text-white hover:bg-gray-800 border-none">{badge}</Badge>
                              )) : <span className="text-[11px] font-bold text-gray-900">None</span>}
                            </div>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Active Flags</p>
                            <div className="flex flex-wrap gap-3 mt-1">
                              {[
                                { key: 'is_featured', label: 'Featured' },
                                { key: 'is_new_arrival', label: 'New Arrival' },
                                { key: 'is_bestseller', label: 'Bestseller' },
                                { key: 'is_trending', label: 'Trending' }
                              ].map(flag => {
                                const isActive = !!selectedProduct[flag.key as keyof ProductItem];
                                return (
                                  <div key={flag.key} className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>{flag.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
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
