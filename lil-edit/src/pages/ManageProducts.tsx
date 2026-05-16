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
import { Link, useNavigate } from "react-router-dom";
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

interface ProductVersionViewProps {
  version: { type: "PUBLISHED" | "DRAFT"; data: ProductItem; label: string };
  isSecondary?: boolean;
  onEdit: (p: ProductItem) => void;
  onLaunch: (p: ProductItem) => void;
  onDelete: (p: ProductItem) => void;
  onDownloadPdf: (p: ProductItem) => void;
}

const ProductVersionView = ({ version, isSecondary, onEdit, onLaunch, onDelete, onDownloadPdf }: ProductVersionViewProps) => {
  const [activeImageTab, setActiveImageTab] = useState<string>("Global");
  const [activeImage, setActiveImage] = useState<string | null>(null);

  useEffect(() => {
    const images = version.type === "PUBLISHED" ? version.data.product_images : version.data.draft_product_images;
    const firstGlobal = images?.find(i => !i.variant_id)?.image_url ?? images?.[0]?.image_url ?? null;
    setActiveImage(firstGlobal);
  }, [version.data.id]);

  const p = version.data;
  const images = version.type === "PUBLISHED" ? p.product_images ?? [] : p.draft_product_images ?? [];
  const variants = version.type === "PUBLISHED" ? p.product_variants ?? [] : p.draft_product_variants ?? [];

  return (
    <div className={`space-y-10 ${isSecondary ? "pt-4 relative" : ""}`}>
      {isSecondary && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-center">
          <div className="w-full h-0.5 bg-black" />
          <div className="absolute px-6 py-2 bg-amber-50 border border-amber-100 rounded-full z-10 whitespace-nowrap">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-700">Pending Update Version Below</p>
          </div>
        </div>
      )}

      {/* Summary Row */}
      <div className="space-y-8">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{p.title}</h2>
            <Badge className={`${version.type === "PUBLISHED" ? "bg-gray-900 text-white hover:bg-gray-900" : "bg-amber-100 text-amber-700 hover:bg-amber-100"} border-none text-[10px] font-bold uppercase tracking-widest px-3 py-1`}>
              {version.label}
            </Badge>
          </div>
          <p className="text-[11px] font-bold text-gray-400 font-mono tracking-widest uppercase">{p.base_sku}</p>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="flex-1">
            <div className="grid grid-cols-2 gap-x-12 gap-y-8 border-t border-b border-gray-100 py-6">
              <div className="space-y-1">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Brand House</p>
                <p className="text-xs font-bold text-gray-900">{p.brand}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Category</p>
                <p className="text-xs font-bold text-gray-900">{p.category}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Selling Price (INR)</p>
                <p className="text-xs font-bold text-gray-900">₹{p.price.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">MRP / Original Price</p>
                <p className="text-xs font-bold text-gray-900">
                  {p.original_price ? `₹${p.original_price.toLocaleString()}` : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto flex flex-col gap-3">
            <div className="flex gap-3">
              <button onClick={() => onEdit(p)} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white rounded font-bold text-[10px] uppercase tracking-widest hover:bg-gray-800 transition-all">
                <Edit3 size={14} /> {version.type === "PUBLISHED" ? "Update" : "Edit Draft"}
              </button>
              <button onClick={() => onDownloadPdf(p)} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-gray-200 text-gray-600 rounded font-bold text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all">
                <Download size={14} /> PDF
              </button>
            </div>
            {version.type === "DRAFT" && (
              <button onClick={() => onLaunch(p)} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#B19CD9] text-black rounded font-bold text-[10px] uppercase tracking-widest hover:brightness-105 transition-all shadow-lg shadow-[#B19CD9]/20">
                <Zap size={14} /> Sync Updates to Live
              </button>
            )}
            <button onClick={() => onDelete(p)} className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-red-200 text-red-500 rounded font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all">
              <Trash2 size={14} /> Remove Version
            </button>
          </div>
        </div>
      </div>

      {/* Documentation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        {/* — IMAGE STUDIO — */}
        <div className="lg:col-span-4 space-y-4">
          <div className="aspect-[3/4] border border-gray-100 bg-gray-50/50 rounded-sm overflow-hidden flex items-center justify-center">
            {activeImage ? (
              <img src={activeImage} className="w-full h-full object-cover" alt={p.title} />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-200">
                <ImageIcon size={32} />
                <span className="text-[9px] font-bold uppercase tracking-widest">No Image</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {["Global", ...variants.map(v => v.color_name)].map(tab => {
                const variant = variants.find(v => v.color_name === tab);
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveImageTab(tab);
                      const tabImages = tab === "Global" ? images.filter(img => !img.variant_id) : images.filter(img => img.variant_id === variant?.id);
                      setActiveImage(tabImages[0]?.image_url ?? null);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded border transition-all ${activeImageTab === tab ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-100 hover:border-gray-300"}`}
                  >
                    {variant && <div className="w-2 h-2 rounded-full border border-white/20" style={{ backgroundColor: variant.color_hex }} />}
                    {tab}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {(activeImageTab === "Global" ? images.filter(img => !img.variant_id) : images.filter(img => img.variant_id === variants.find(v => v.color_name === activeImageTab)?.id)).map((img, i) => (
                <button key={i} onClick={() => setActiveImage(img.image_url)} className={`w-12 h-16 border bg-gray-50 shrink-0 overflow-hidden transition-all ${activeImage === img.image_url ? "border-gray-900" : "border-gray-100 opacity-50 hover:opacity-80"}`}>
                  <img src={img.image_url} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* — SPECS & MATRIX — */}
        <div className="lg:col-span-8 space-y-12">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-gray-400" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Technical Specifications</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-8 gap-x-4">
              {[
                { label: "Category", value: p.category },
                { label: "Gender", value: p.gender || "N/A" },
                { label: "Sizes", value: p.sizes?.length ? p.sizes.join(", ") : "N/A" },
                { label: "Fabrication", value: p.fabric || "N/A" },
                { label: "Silhouette", value: p.fit || "N/A" },
                { label: "Occasion", value: p.occasion || "N/A" },
                { label: "Maintenance", value: p.care || "N/A" }
              ].map((item, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{item.label}</p>
                  <p className="text-[11px] font-bold text-gray-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Boxes size={14} className="text-gray-400" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Inventory Distribution Matrix</h3>
            </div>
            <div className="border border-gray-100 rounded-sm overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 font-bold text-gray-400 uppercase tracking-wider">Variant</th>
                    <th className="px-6 py-3 font-bold text-gray-400 uppercase tracking-wider">SKU</th>
                    <th className="px-6 py-3 font-bold text-gray-400 uppercase tracking-wider text-right">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {variants.map((v, i) => (
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
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-gray-400" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Merchandising & Taxonomy</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-8 gap-x-4">
              <div className="space-y-2">
                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.tags?.length ? p.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[9px] font-bold uppercase tracking-widest bg-gray-100 text-gray-600 border-none">{tag}</Badge>
                  )) : <span className="text-[11px] font-bold text-gray-900">None</span>}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Badges</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.badges?.length ? p.badges.map(badge => (
                    <Badge key={badge} variant="secondary" className="text-[9px] font-bold uppercase tracking-widest bg-gray-900 text-white border-none">{badge}</Badge>
                  )) : <span className="text-[11px] font-bold text-gray-900">None</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-gray-400" />
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Catalogue Highlights</h3>
            </div>
            <div className="space-y-3">
              {p.description_points?.length ? p.description_points.map((pt, i) => (
                <div key={i} className="flex gap-3 text-[11px] leading-relaxed text-gray-500 font-medium">
                  <span className="text-gray-900 font-bold shrink-0">0{i + 1}.</span>
                  <p>{pt}</p>
                </div>
              )) : <p className="text-[11px] text-gray-300 italic">No highlights provided.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface GroupedProduct {
  base_sku: string;
  published?: ProductItem;
  draft?: ProductItem;
  // Metadata for the list view (prefers published data)
  id: string;
  title: string;
  price: number;
  image_url: string;
  created_at: string;
}

const ManageProducts = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<GroupedProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<GroupedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "DRAFT" | "PUBLISHED">("ALL");
  const [isMobileDetailView, setIsMobileDetailView] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [activeImageTab, setActiveImageTab] = useState<string>("Global");
  const [activeVersion, setActiveVersion] = useState<"PUBLISHED" | "DRAFT">("PUBLISHED");

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const base = getBackendBaseUrl();
      const res = await fetch(`${base}/api/products`);
      if (!res.ok) throw new Error("Failed to fetch products");
      const data = await res.json();

      const published = data.published?.map((p: any) => ({
        ...p,
        status: "PUBLISHED" as const,
        image_url: p.product_images?.find((i: ProductImage) => !i.variant_id)?.image_url
          ?? p.product_images?.[0]?.image_url
      })) ?? [];

      const drafts = data.drafts?.map((d: any) => ({
        ...d,
        status: "DRAFT" as const,
        image_url: d.draft_product_images?.find((i: ProductImage) => !i.variant_id)?.image_url
          ?? d.draft_product_images?.[0]?.image_url
      })) ?? [];

      // Grouping logic
      const groupedMap = new Map<string, GroupedProduct>();

      published.forEach((p: ProductItem) => {
        groupedMap.set(p.base_sku, {
          base_sku: p.base_sku,
          published: p,
          id: p.id,
          title: p.title,
          price: p.price,
          image_url: p.image_url ?? "",
          created_at: p.created_at
        });
      });

      drafts.forEach((d: ProductItem) => {
        const existing = groupedMap.get(d.base_sku);
        if (existing) {
          existing.draft = d;
        } else {
          groupedMap.set(d.base_sku, {
            base_sku: d.base_sku,
            draft: d,
            id: d.id,
            title: d.title,
            price: d.price,
            image_url: d.image_url ?? "",
            created_at: d.created_at
          });
        }
      });

      const all: GroupedProduct[] = Array.from(groupedMap.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
  }, [selectedProduct?.base_sku]);

  const handleProductSelect = (product: GroupedProduct) => {
    setSelectedProduct(product);
    setActiveVersion(product.draft ? "DRAFT" : "PUBLISHED");
    setIsMobileDetailView(true);
  };

  const handleEditProduct = (product: ProductItem) => {
    navigate(`/admin/edit/${product.id}`);
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

    let matchesStatus = true;
    if (filterStatus === "PUBLISHED") {
      matchesStatus = !!p.published;
    } else if (filterStatus === "DRAFT") {
      matchesStatus = !!p.draft;
    }

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
                key={p.base_sku}
                onClick={() => handleProductSelect(p)}
                className={`w-full text-left px-6 py-4 transition-all flex gap-4 ${selectedProduct?.base_sku === p.base_sku ? "bg-gray-50 border-r-4 border-r-gray-900" : "hover:bg-gray-50/50"}`}
              >
                <div className="w-10 h-12 bg-gray-100 rounded border border-gray-200 flex-shrink-0 overflow-hidden relative">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-gray-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-xs font-bold truncate leading-tight ${selectedProduct?.base_sku === p.base_sku ? "text-gray-900" : "text-gray-600"}`}>{p.title}</h3>
                      <span className="text-[9px] text-gray-400 font-mono font-medium block mt-0.5">{p.base_sku}</span>
                    </div>
                    {p.published && (
                      <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-gray-900 text-white whitespace-nowrap uppercase">Published</span>
                    )}
                  </div>
                  <div className="flex items-end justify-between mt-2">
                    <p className="text-[10px] font-bold text-gray-900">₹{p.price.toLocaleString()}</p>
                    <div className="flex flex-col items-end gap-1">
                      {p.published && p.draft && (
                        <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap uppercase">Updates To be Synced</span>
                      )}
                      {!p.published && p.draft && (
                        <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 whitespace-nowrap uppercase">Draft</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT COLUMN — Detail View (75%) */}
        <section className={`md:w-[75%] bg-white pb-32 transition-all duration-300 md:translate-x-0 ${isMobileDetailView ? "block translate-x-0" : "hidden md:block translate-x-full md:translate-x-0"}`}>

          {/* Mobile Back */}
          <div className="md:hidden p-6 bg-white border-b border-gray-100 flex items-center justify-between">
            <button onClick={() => setIsMobileDetailView(false)} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-900 transition-all">
              <ArrowLeft size={16} /> Back to Catalog
            </button>
            <div className="flex gap-2">
              {selectedProduct?.published && <Badge variant="outline" className="text-[7px] font-bold uppercase">Live</Badge>}
              {selectedProduct?.draft && <Badge variant="outline" className="text-[7px] font-bold uppercase bg-amber-50 text-amber-600 border-amber-100">Sync</Badge>}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {selectedProduct ? (
              <motion.div
                key={selectedProduct.base_sku}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-8 pt-2 pb-16 lg:px-16 lg:pt-4 lg:pb-20 max-w-5xl mx-auto"
              >
                <div className="space-y-12">
                  {[
                    { type: "PUBLISHED" as const, data: selectedProduct.published, label: "Published Version" },
                    { type: "DRAFT" as const, data: selectedProduct.draft, label: "Updates To be Synced" }
                  ].filter(v => v.data).map((version, idx) => (
                    <ProductVersionView
                      key={version.type}
                      version={version as any}
                      isSecondary={idx > 0}
                      onEdit={handleEditProduct}
                      onLaunch={handleLaunchProduct}
                      onDelete={handleDeleteProduct}
                      onDownloadPdf={handleDownloadPdf}
                    />
                  ))}
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
