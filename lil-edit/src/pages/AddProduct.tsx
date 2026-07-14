import { useEffect, useRef, useState } from "react";
import { invalidateAfterMutation } from "@/lib/catalogCache";
import { buildPayloadFromForm } from "@/lib/buildProductPayload";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Upload,
  X,
  Zap,
  TrendingUp,
  Star,
  Save,
  Send,
  Loader,
  Search,
  Plus,
  Minus,
  Flame,
  Tag,
  Play,
  ChevronRight
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import ProductPreviewView from "@/components/ProductPreviewView";
import StockToggleSlider from "@/components/StockToggleSlider";
import StyledSelect from "@/components/StyledSelect";
import SizeChartSelect from "@/components/admin/SizeChartSelect";
import ImageTabSlider from "@/components/ImageTabSlider";
import type { Product, ProductImage, ProductColor } from "@/types/product";
import { generateColorSku } from "@/utils/sku";
import { slugify } from "@/utils/slug";
import { getBackendBaseUrl } from "@/lib/backend";
import { authHeader } from "@/lib/apiAuth";
import { uploadProductImage } from "@/lib/uploadImage";
import { toast } from "sonner";

const SIZES = [
  "6-12 Months",
  "1-2 Years",
  "2-3 Years",
  "3-4 Years",
  "4-5 Years",
  "5-6 Years",
  "6-7 Years",
  "7-8 Years",
  "8-9 Years",
  "9-10 Years",
  "10-11 Years",
  "11-12 Years",
  "XS", "S", "M", "L", "XL"
];

const CATEGORIES = [
  "Ethnic Wear",
  "Party Wear",
  "Casual Wear",
  "Accessories",
];

const GENDERS = ["Girls", "Boys", "Unisex"];

interface FormData {
  name: string;
  brand: string;
  sku: string;
  category: string;
  gender: string;
  price: string;
  originalPrice: string;
  tags: string[];
  fabric: string;
  fit: string;
  occasion: string;
  care_instructions: string;
  /** size_charts.id backing this product's size guide ("" until charts load). */
  sizeChartId: string;
  descriptionPoints: string[];
  selectedSizes: string[];
  selectedColors: {
    name: string;
    hex: string;
    sku: string;
    stock: number;
    isUnlimited?: boolean;
    images: string[]; // URLs/Base64 strings for preview
  }[];
  featured: boolean;
  newArrival: boolean;
  bestseller: boolean;
  trending: boolean;
  customBadges: string[];
  slug: string;
  categorySlug: string;
}

const COLOR_MAP: Record<string, string> = {
  "Lavender": "#E6E6FA",
  "White": "#FFFFFF",
  "Black": "#000000",
  "Red": "#FF0000",
  "Blue": "#0000FF",
  "Green": "#008000",
  "Brown": "#A52A2A",
  "Pink": "#FFC0CB",
  "Gold": "#FFD700",
  "Silver": "#C0C0C0",
  "Ivory": "#FFFFF0",
  "Mint Green": "#98FF98",
  "Navy Blue": "#000080",
  "Beige": "#F5F5DC",
  "Teal": "#008080",
  "Mustard": "#FFDB58",
  "Peach": "#FFDAB9",
  "Maroon": "#800000",
  "Olive": "#808000",
  "Charcoal": "#36454F",
  "Magenta": "#FF00FF",
  "Cyan": "#00FFFF",
  "Yellow": "#FFFF00",
  "Orange": "#FFA500",
  "Purple": "#800080",
};

const HEX_TO_NAME = Object.fromEntries(
  Object.entries(COLOR_MAP).map(([name, hex]) => [hex.toUpperCase(), name])
);


type PersistDatabaseResult =
  | { ok: true; draftProductId?: string; publishedProductId?: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string };

async function sendCurationToBackend(
  status: "DRAFT" | "PUBLISHED",
  formData: FormData,
  imagePreviews: string[],
  isStockUnlimited: boolean,
  skuIsPreview: boolean
): Promise<{ database?: PersistDatabaseResult; committedSku?: string }> {
  const base = getBackendBaseUrl();
  // skuIsPreview=true → first save of a new product: the form's SKU is only a
  // read-only preview and the backend mints (reserves) the real one on save.
  const body = { status, skuIsPreview, ...buildPayloadFromForm(formData, imagePreviews, isStockUnlimited) };
  console.log(`[AddProduct] POST /api/products/preview  status=${status}  sku=${(body as { sku?: string }).sku ?? "?"}  skuIsPreview=${skuIsPreview}`);
  const res = await fetch(`${base}/api/products/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  console.log(`[AddProduct] preview → ${res.status}${res.status === 401 || res.status === 403 ? " (admin auth failed)" : ""}`);
  let json: {
    ok?: boolean;
    sku?: string;
    previewPath?: string;
    message?: string;
    database?: PersistDatabaseResult;
  } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    throw new Error(
      (json.database && "error" in json.database ? json.database.error : undefined) ||
        json.message ||
        `Backend error (${res.status})`
    );
  }
  if (json.sku && json.sku !== (body as { sku?: string }).sku) {
    console.log(`[AddProduct] server committed sku=${json.sku} (preview was ${(body as { sku?: string }).sku})`);
  }
  return { database: json.database, committedSku: json.sku };
}

const mapFormDataToProduct = (formData: FormData, imagePreviews: string[], isStockUnlimited = false): Product => {
  const productImages: ProductImage[] = imagePreviews.map((url, index) => ({
    id: `img-${index}`,
    url,
    sortOrder: index,
  }));

  const colors: ProductColor[] = formData.selectedColors.map((color) => ({
    name: color.name,
    hex: color.hex,
    sku: color.sku,
    stock: color.isUnlimited ? null : color.stock,
    isUnlimited: color.isUnlimited,
    images: color.images.map((url, index) => ({
      id: `img-${color.name}-${index}`,
      url,
      sortOrder: index,
    })),
  }));

  return {
    title: formData.name || "Untitled Product",
    slug: formData.slug || slugify(formData.name || "Untitled Product"),
    categorySlug: formData.categorySlug || slugify(formData.category || "General"),
    brand: formData.brand || "The Lil Edit",
    sku: formData.sku || "SKU-CAT",
    category: formData.category || "General",
    gender: formData.gender || "Unisex",
    price: Number(formData.price) || 0,
    originalPrice: Number(formData.originalPrice) || 0,
    tags: formData.tags,
    badges: formData.customBadges,
    descriptionPoints: formData.descriptionPoints,
    fabric: formData.fabric || "Not specified",
    fit: formData.fit || "Not specified",
    occasion: formData.occasion || "General wear",
    care_instructions: formData.care_instructions || "Not specified",
    images: productImages,
    sizes: formData.selectedSizes.length > 0 ? formData.selectedSizes : ["Free Size"],
    colors: colors.length > 0 ? colors : [],
    featured: formData.featured,
    newArrival: formData.newArrival,
    bestseller: formData.bestseller,
    trending: formData.trending,
    isUnlimited: isStockUnlimited,
  };
};

const AddProduct = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isGeneratingSku, setIsGeneratingSku] = useState(false);
  // False until the first successful draft save / launch. While false the SKU
  // shown is a server peek (nothing reserved); the first successful save mints
  // the real SKU server-side and locks the identifier for this product.
  const [skuCommitted, setSkuCommitted] = useState(false);
  // Size selection mode — "range": tap a start and an end size and everything
  // between them (in SIZES order) fills in; "individual": per-size toggling.
  const [sizeMode, setSizeMode] = useState<"range" | "individual">("range");
  // First endpoint of an in-progress range selection (null = none started).
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [newPoint, setNewPoint] = useState("");
  const [newColorInput, setNewColorInput] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newBadgeName, setNewBadgeName] = useState("");
  const [availableCustomBadges, setAvailableCustomBadges] = useState<string[]>([]);

  const [formData, setFormData] = useState<FormData>({
    name: "",
    brand: "The Lil Edit",
    sku: "",
    category: "",
    gender: "",
    price: "",
    originalPrice: "",
    tags: [],
    fabric: "",
    fit: "",
    occasion: "",
    care_instructions: "",
    sizeChartId: "",
    descriptionPoints: [],
    selectedSizes: [],
    selectedColors: [],
    featured: false,
    newArrival: false,
    bestseller: false,
    trending: false,
    customBadges: [],
    slug: "",
    categorySlug: "",
  });

  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [savedPreviewProduct, setSavedPreviewProduct] = useState<Product | null>(null);
  const [previewActivated, setPreviewActivated] = useState(false);
  const [activeImageTab, setActiveImageTab] = useState<"Global" | string>("Global");
  const [isStockUnlimited, setIsStockUnlimited] = useState(false);

  const toTitleCase = (str: string) => {
    return str
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleToggle = (field: keyof FormData) => {
    setFormData((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const addDescriptionPoint = () => {
    if (newPoint.trim()) {
      setFormData(prev => ({
        ...prev,
        descriptionPoints: [...prev.descriptionPoints, newPoint.trim()]
      }));
      setNewPoint("");
    }
  };

  const removeDescriptionPoint = (index: number) => {
    setFormData(prev => ({
      ...prev,
      descriptionPoints: prev.descriptionPoints.filter((_, i) => i !== index)
    }));
  };

  const toggleSize = (size: string) => {
    setFormData((prev) => {
      const updated = prev.selectedSizes.includes(size)
        ? prev.selectedSizes.filter((s) => s !== size)
        : [...prev.selectedSizes, size];
      return {
        ...prev,
        selectedSizes: updated.sort((a, b) => SIZES.indexOf(a) - SIZES.indexOf(b)),
      };
    });
  };

  const handleSizeClick = (size: string) => {
    if (sizeMode === "individual") {
      toggleSize(size);
      return;
    }
    if (rangeAnchor === null) {
      // First tap anchors a fresh range (replacing any previous selection).
      setRangeAnchor(size);
      setFormData(prev => ({ ...prev, selectedSizes: [size] }));
    } else if (rangeAnchor === size) {
      // Tapping the anchor again clears it.
      setRangeAnchor(null);
      setFormData(prev => ({ ...prev, selectedSizes: [] }));
    } else {
      // Second tap completes the range — endpoints accepted in either order.
      const a = SIZES.indexOf(rangeAnchor);
      const b = SIZES.indexOf(size);
      const [from, to] = a < b ? [a, b] : [b, a];
      setFormData(prev => ({ ...prev, selectedSizes: SIZES.slice(from, to + 1) }));
      setRangeAnchor(null);
    }
  };

  const handleSizeModeChange = (individual: boolean) => {
    setSizeMode(individual ? "individual" : "range");
    setRangeAnchor(null);
  };

  const addColor = () => {
    if (newColorInput.trim()) {
      let name = "";
      let hex = "";

      // Smart parsing
      if (newColorInput.includes("#")) {
        const parts = newColorInput.split("#");
        name = parts[0].trim();
        hex = `#${parts[1].trim()}`;

        // If name is empty, try to find it from hex
        if (!name) {
          name = HEX_TO_NAME[hex.toUpperCase()] || "Custom Color";
        }
      } else {
        // Just a name or just a hex without #
        const input = newColorInput.trim();
        const matchedHex = COLOR_MAP[input.charAt(0).toUpperCase() + input.slice(1).toLowerCase()];

        if (matchedHex) {
          name = input;
          hex = matchedHex;
        } else if (/^[0-9A-F]{6}$/i.test(input)) {
          // It's a hex without #
          hex = `#${input.toUpperCase()}`;
          name = HEX_TO_NAME[hex] || "Custom Color";
        } else {
          // Just a custom name
          name = input;
          hex = input.toLowerCase(); // Browser fallback
        }
      }

      // Apply Title Case (e.g. red -> Red)
      const formattedName = toTitleCase(name);

      const baseSku = formData.sku || "SKU-CAT";
      const variantSku = generateColorSku(baseSku, formattedName);

      setFormData(prev => ({
        ...prev,
        selectedColors: [...prev.selectedColors, { 
          name: formattedName, 
          hex, 
          sku: variantSku, 
          stock: isStockUnlimited ? 0 : 1,
          isUnlimited: isStockUnlimited,
          images: [] 
        }]
      }));
      setNewColorInput("");
    }
  };

  const handleGlobalStockMode = (unlimited: boolean) => {
    setIsStockUnlimited(unlimited);
    setFormData(prev => ({
      ...prev,
      selectedColors: prev.selectedColors.map(c =>
        unlimited
          ? { ...c, isUnlimited: true, stock: 0 }
          : { ...c, isUnlimited: false, stock: c.isUnlimited ? 1 : c.stock }
      ),
    }));
  };

  const toggleVariantStockMode = (colorName: string, isUnlimited: boolean) => {
    setFormData(prev => ({
      ...prev,
      selectedColors: prev.selectedColors.map(c => 
        c.name === colorName ? { ...c, isUnlimited, stock: isUnlimited ? 0 : 1 } : c
      )
    }));
  };

  const updateVariantStock = (colorName: string, stock: number) => {
    setFormData(prev => ({
      ...prev,
      selectedColors: prev.selectedColors.map(c => 
        c.name === colorName ? { ...c, stock } : c
      )
    }));
  };

  const removeColor = (colorName: string) => {
    setFormData(prev => ({
      ...prev,
      selectedColors: prev.selectedColors.filter(c => c.name !== colorName)
    }));
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const createBadge = () => {
    if (newBadgeName.trim() && !availableCustomBadges.includes(newBadgeName.trim())) {
      setAvailableCustomBadges(prev => [...prev, newBadgeName.trim()]);
      setNewBadgeName("");
    }
  };

  const toggleCustomBadge = (badge: string) => {
    setFormData(prev => ({
      ...prev,
      customBadges: prev.customBadges.includes(badge)
        ? prev.customBadges.filter(b => b !== badge)
        : [...prev.customBadges, badge]
    }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFiles = (files: FileList, targetTab: "Global" | string) => {
    const newFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (newFiles.length === 0) return;

    setUploadingCount((prev) => prev + newFiles.length);

    for (const file of newFiles) {
      void (async () => {
        try {
          const url = await uploadProductImage(
            file,
            formData.sku || "temp",
            targetTab === "Global" ? "global" : targetTab,
          );
          if (targetTab === "Global") {
            setImagePreviews((prev) => [...prev, url]);
          } else {
            setFormData((prev) => ({
              ...prev,
              selectedColors: prev.selectedColors.map((c) =>
                c.name === targetTab ? { ...c, images: [...c.images, url] } : c
              ),
            }));
          }
        } catch (err) {
          toast.error(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        } finally {
          setUploadingCount((prev) => prev - 1);
        }
      })();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files, activeImageTab);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files, activeImageTab);
    }
  };

  const removeImage = (index: number, targetTab: "Global" | string) => {
    if (targetTab === "Global") {
      setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    } else {
      setFormData(prev => ({
        ...prev,
        selectedColors: prev.selectedColors.map(c => 
          c.name === targetTab ? { ...c, images: c.images.filter((_, i) => i !== index) } : c
        )
      }));
    }
  };

  const calculateDiscount = () => {
    if (!formData.price || !formData.originalPrice) return 0;
    const selling = parseFloat(formData.price);
    const original = parseFloat(formData.originalPrice);
    if (original <= selling) return 0;
    return Math.round(((original - selling) / original) * 100);
  };

  const validateForm = () => {
    const missingFields: string[] = [];
    if (!formData.name.trim()) missingFields.push("Product Title");
    if (!formData.category) missingFields.push("Category");
    if (!formData.gender) missingFields.push("Gender Category");
    if (!formData.sku.trim()) missingFields.push("Product Base Identifier");

    if (missingFields.length > 0) {
      alert(`Required Details Missing: \n\nPlease provide: ${missingFields.join(", ")}`);
      return false;
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const { database, committedSku } = await sendCurationToBackend("DRAFT", formData, imagePreviews, isStockUnlimited, !skuCommitted);
      const mappedProduct = mapFormDataToProduct(formData, imagePreviews, isStockUnlimited);
      setSavedPreviewProduct(mappedProduct);
      setPreviewActivated(true);
      if (database && database.ok === false && "skipped" in database && database.skipped) {
        toast.warning(database.reason);
      } else {
        const finalSku = committedSku || formData.sku;
        if (committedSku && committedSku !== formData.sku) {
          setFormData(prev => ({ ...prev, sku: committedSku }));
        }
        setSkuCommitted(true);
        toast.success("Draft saved to Supabase (draft tables).");
        invalidateAfterMutation(finalSku || undefined);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reach the backend. Is it running on port 5000?");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!validateForm()) return;

    setIsPublishing(true);
    try {
      const { database, committedSku } = await sendCurationToBackend("PUBLISHED", formData, imagePreviews, isStockUnlimited, !skuCommitted);
      const mappedProduct = mapFormDataToProduct(formData, imagePreviews, isStockUnlimited);
      setSavedPreviewProduct(mappedProduct);
      setPreviewActivated(true);
      if (database && database.ok === false && "skipped" in database && database.skipped) {
        toast.warning(database.reason);
      } else {
        const finalSku = committedSku || formData.sku;
        if (committedSku && committedSku !== formData.sku) {
          setFormData(prev => ({ ...prev, sku: committedSku }));
        }
        setSkuCommitted(true);
        toast.success(`The Product\nTitle: ${formData.name}\nSKU: ${finalSku}\nhas successfully launched!`);
        // Redirect to home page after successful launch
        setTimeout(() => {
          navigate("/");
        }, 2000);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reach the backend. Is it running on port 5000?");
    } finally {
      setIsPublishing(false);
    }
  };

  const discountPercent = calculateDiscount();

  useEffect(() => {
    if (!previewActivated) return;
    setSavedPreviewProduct(mapFormDataToProduct(formData, imagePreviews, isStockUnlimited));
  }, [previewActivated, formData, imagePreviews, isStockUnlimited]);

  // Reactive SKU update for variants
  useEffect(() => {
    if (formData.sku) {
      setFormData(prev => ({
        ...prev,
        selectedColors: prev.selectedColors.map(color => ({
          ...color,
          sku: generateColorSku(formData.sku, color.name)
        }))
      }));
    }
  }, [formData.sku]);

  // Reactive Base SKU preview from server when category or gender changes.
  // Peek only — nothing is reserved until the first draft save / launch, so
  // changing category/gender here without saving burns no SKU numbers. Once
  // the SKU is committed (first successful save), the identifier is locked
  // and later category/gender edits no longer touch it.
  useEffect(() => {
    if (!formData.category || !formData.gender) return;
    if (skuCommitted) return;

    const fetchSku = async () => {
      setIsGeneratingSku(true);
      try {
        const base = getBackendBaseUrl();
        console.log(`[AddProduct] GET /api/sku/generate (peek)  category=${formData.category}  gender=${formData.gender}`);
        const res = await fetch(`${base}/api/sku/generate?category=${encodeURIComponent(formData.category)}&gender=${encodeURIComponent(formData.gender)}`, {
          headers: { ...(await authHeader()) },
        });
        console.log(`[AddProduct] sku/generate → ${res.status}${res.status === 401 || res.status === 403 ? " (admin auth failed)" : ""}`);
        const json = await res.json();
        if (json.sku) {
          console.log(`[AddProduct] preview sku=${json.sku} (not reserved yet)`);
          setFormData(prev => ({ ...prev, sku: json.sku }));
        }
      } catch (err) {
        console.error("Failed to fetch SKU:", err);
      } finally {
        setIsGeneratingSku(false);
      }
    };

    fetchSku();
  }, [formData.category, formData.gender, skuCommitted]);

  // Reactive Slug generation when name or category changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      slug: slugify(prev.name),
      categorySlug: slugify(prev.category)
    }));
  }, [formData.name, formData.category]);



  if (authLoading) {
    return <RouteFallback />;
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden w-full selection:bg-gray-900/20">
      {user ? <UserNavbar /> : <Navbar />}
      <div className="relative pt-[calc(var(--navbar-height)+5px)] sm:pt-[calc(var(--navbar-height)+15px)] pb-24">
        <div className="mx-auto max-w-screen-2xl px-3 lg:px-6">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8 space-y-1"
          >
            <div className="pt-3 pb-2 mt-1.5">
              <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
                <Link to="/" className="hover:underline">
                  Home
                </Link>
                <ChevronRight className="w-4 h-4" />
                <span className="text-gray-800 font-medium">Add Product</span>
              </div>
            </div>
            <div className="flex items-center">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: "#B19CD9" }}>
                Creator's Studio
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Product Listings
            </h1>
          </motion.div>

          <hr className="-mx-3 lg:-mx-6 mb-8 border-t border-foreground/50" />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Main Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="lg:col-span-3"
            >
              <div className="bg-white rounded-lg border border-foreground/50 shadow-md p-4 sm:p-10 space-y-12">
                {/* Basic Info */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#B19CD9" }} />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Essential Details</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Product Title
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="e.g. Criss-Cross Back Knot Top"
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Brand House
                      </label>
                      <input
                        type="text"
                        name="brand"
                        value={formData.brand}
                        onChange={handleInputChange}
                        placeholder="e.g. Atelier Edit"
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Editorial Specifications */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#B19CD9" }} />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Specifications</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Fabric & Lining
                      </label>
                      <input
                        type="text"
                        name="fabric"
                        value={formData.fabric}
                        onChange={handleInputChange}
                        placeholder="e.g. Organza with Cotton Lining"
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Silhouette & Fit
                      </label>
                      <input
                        type="text"
                        name="fit"
                        value={formData.fit}
                        onChange={handleInputChange}
                        placeholder="e.g. Regular Fit"
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Occasion
                      </label>
                      <input
                        type="text"
                        name="occasion"
                        value={formData.occasion}
                        onChange={handleInputChange}
                        placeholder="e.g. Festive, Wedding"
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Care Instructions
                      </label>
                      <input
                        type="text"
                        name="care_instructions"
                        value={formData.care_instructions}
                        onChange={handleInputChange}
                        placeholder="e.g. Dry Clean Only"
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Description Points */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Product Details</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={newPoint}
                        onChange={(e) => setNewPoint(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && addDescriptionPoint()}
                        placeholder="Add a product feature or note..."
                        className="flex-1 px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-primary/50 outline-none transition-all duration-300 font-body text-base"
                      />
                      <button
                        onClick={addDescriptionPoint}
                        className="shrink-0 min-w-[84px] sm:min-w-[120px] flex flex-col items-center justify-center px-4 sm:px-8 rounded-md bg-[#0B5B55] text-white font-bold text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-widest hover:brightness-110 transition-all shadow-lg shadow-teal-900/10 text-center leading-tight"
                      >
                        Add<br />Details
                      </button>
                    </div>

                    <div className="space-y-3">
                      {formData.descriptionPoints.map((point, idx) => (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={idx}
                          className="flex items-center justify-between gap-4 p-4 bg-gray-50 border border-gray-300 rounded-md group hover:border-primary/20 hover:bg-white transition-all duration-300 shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-start gap-3">
                            <Play className="w-4 h-4 text-teal-600 mt-0.5 shrink-0 fill-teal-600" />
                            <span className="text-[13px] text-gray-900 leading-relaxed">{point}</span>
                          </div>
                          <button
                            onClick={() => removeDescriptionPoint(idx)}
                            className="p-2 text-gray-900 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <X size={16} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Classification */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Classification</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Category
                      </label>
                      <StyledSelect
                        value={formData.category}
                        onChange={(val) => setFormData((prev) => ({ ...prev, category: val }))}
                        options={CATEGORIES}
                        placeholder="Select a category"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Gender Category
                      </label>
                      <StyledSelect
                        value={formData.gender}
                        onChange={(val) => setFormData((prev) => ({ ...prev, gender: val }))}
                        options={GENDERS}
                        placeholder="Select gender"
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Pricing */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Pricing</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Original Price (MRP)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-body">₹</span>
                        <input
                          type="number"
                          name="originalPrice"
                          value={formData.originalPrice}
                          onChange={handleInputChange}
                          placeholder="0.00"
                          className="w-full pl-8 pr-4 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                        />
                      </div>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Selling Price
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-body">₹</span>
                        <input
                          type="number"
                          name="price"
                          value={formData.price}
                          onChange={handleInputChange}
                          placeholder="0.00"
                          className="w-full pl-8 pr-4 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                        />
                      </div>
                    </motion.div>

                    {discountPercent > 0 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="group"
                      >
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 select-none">
                          Discount
                        </label>
                        <div className="flex items-center justify-center gap-2 px-4 py-4 bg-red-500/5 border border-red-500/20 rounded-md w-fit">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-red-500/70">Markdown</span>
                          <span className="text-sm font-bold text-red-500 leading-none">{discountPercent}% OFF</span>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Inventory */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Inventory Control</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                    <motion.div whileHover={{ scale: 1.01 }} className="group transition-all duration-300">
                      <div className="flex items-center h-12 mb-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-gray-800 transition-colors group-focus-within:text-gray-900">
                          Overall Stock Level
                        </label>
                      </div>
                      
                      <StockToggleSlider
                        isUnlimited={isStockUnlimited}
                        onChange={handleGlobalStockMode}
                        className="w-full h-[50px]"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <div className="flex items-center h-12 mb-2">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-gray-800 transition-colors group-focus-within:text-gray-900">
                          Product Base Identifier
                        </label>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          name="sku"
                          value={formData.sku}
                          readOnly
                          placeholder={isGeneratingSku ? "Generating..." : "Select category & gender"}
                          className={`w-full px-5 py-4 rounded-xl border border-gray-200 ${isGeneratingSku ? 'bg-[#F0F0F2] animate-pulse' : 'bg-[#F5F4F6]'} text-gray-800 cursor-not-allowed outline-none transition-all duration-300 font-mono text-[13px] tracking-wider`}
                        />
                        {isGeneratingSku && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <Loader className="w-4 h-4 text-gray-900 animate-spin" />
                          </div>
                        )}
                        {!isGeneratingSku && formData.sku && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Tags */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Search & Discovery</h2>
                  </div>

                  <div className="space-y-6">
                    <div className="flex gap-3">
                      <div className="relative flex-1 group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 group-focus-within:text-gray-900 transition-colors">
                          <Search size={18} />
                        </div>
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && addTag()}
                          placeholder="Add discovery tags (e.g. Minimalist, Organic)..."
                          className="w-full pl-12 pr-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-primary/50 outline-none transition-all duration-300 font-body text-base"
                        />
                      </div>
                      <button
                        onClick={addTag}
                        className="shrink-0 min-w-[84px] sm:min-w-[120px] flex flex-col items-center justify-center px-4 sm:px-8 rounded-md bg-[#0B5B55] text-white font-bold text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-widest hover:brightness-110 transition-all shadow-lg shadow-teal-900/10 text-center leading-tight"
                      >
                        Add<br />Tag
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 min-h-[48px] p-2 rounded-2xl border-2 border-dashed border-gray-400 bg-gray-50">
                      {formData.tags.length > 0 ? (
                        formData.tags.map((tag) => (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={tag}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-[11px] font-bold text-gray-900 uppercase tracking-widest shadow-sm hover:shadow-md transition-all group"
                          >
                            {tag}
                            <button
                              onClick={() => removeTag(tag)}
                              className="text-gray-900 hover:text-red-500 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </motion.div>
                        ))
                      ) : (
                        <div className="w-full flex items-center justify-center py-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-800">No tags defined</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sizes */}
                <div className="space-y-8">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Available Sizes</h2>
                    <StockToggleSlider
                      isUnlimited={sizeMode === "individual"}
                      onChange={handleSizeModeChange}
                      limitedLabel="Range"
                      unlimitedLabel="Individual"
                      className="w-44 h-9 ml-auto"
                    />
                  </div>

                  <div className="space-y-3 sm:space-y-4">
                    {sizeMode === "range" && (
                      <p className="text-[11px] font-medium text-gray-500">
                        {rangeAnchor ? (
                          <>Start: <span className="font-bold text-gray-900">{rangeAnchor}</span> — now tap the end size (tap it again to clear).</>
                        ) : (
                          "Tap the first size, then the last — everything in between selects automatically."
                        )}
                      </p>
                    )}
                    <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                      {SIZES.filter(s => s.includes("Months") || s.includes("Years")).map((size) => (
                        <motion.button
                          key={size}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSizeClick(size)}
                          className={`w-full py-4 rounded-md font-display font-medium text-sm transition-all duration-300 border shadow-sm ${formData.selectedSizes.includes(size)
                            ? "border-[#9E86C9] bg-[#B19CD9] text-black shadow-md shadow-purple-900/10"
                            : "border-gray-400 bg-white text-gray-900 hover:border-[#B19CD9]/50"
                            }`}
                        >
                          {size}
                        </motion.button>
                      ))}
                    </div>
                    <div className="flex gap-3 sm:gap-4">
                      {SIZES.filter(s => !s.includes("Months") && !s.includes("Years")).map((size) => (
                        <motion.button
                          key={size}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSizeClick(size)}
                          className={`flex-1 py-4 rounded-md font-display font-medium text-sm transition-all duration-300 border shadow-sm ${formData.selectedSizes.includes(size)
                            ? "border-[#9E86C9] bg-[#B19CD9] text-black shadow-md shadow-purple-900/10"
                            : "border-gray-400 bg-white text-gray-900 hover:border-[#B19CD9]/50"
                            }`}
                        >
                          {size}
                        </motion.button>
                      ))}
                    </div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group pt-2">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2 transition-colors group-focus-within:text-gray-900">
                        Sizing Chart
                      </label>
                      <SizeChartSelect
                        value={formData.sizeChartId}
                        onChange={(id) => setFormData((prev) => ({ ...prev, sizeChartId: id }))}
                        className="sm:max-w-sm"
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Colors */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Color Palette</h2>
                  </div>

                  <div className="space-y-6">
                    {/* Smart Add Color */}
                    <div className="flex gap-3">
                      <div className="relative flex-1 group">
                        <input
                          type="text"
                          value={newColorInput}
                          onChange={(e) => setNewColorInput(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && addColor()}
                          placeholder="Type 'Lavender', '#E6E6FA', or 'Lavender #E6E6FA'..."
                          className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-primary/50 outline-none transition-all duration-300 font-body text-base"
                        />
                      </div>
                      <button
                        onClick={addColor}
                        className="shrink-0 min-w-[84px] sm:min-w-[120px] flex flex-col items-center justify-center px-4 sm:px-8 rounded-md bg-[#0B5B55] text-white font-bold text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-widest hover:brightness-110 transition-all shadow-lg shadow-teal-900/10 text-center leading-tight"
                      >
                        Add<br />Color
                      </button>
                    </div>

                    {/* Selected Colors List */}
                    <div className="grid grid-cols-1 gap-6">
                      {formData.selectedColors.length > 0 ? (
                        formData.selectedColors.map((color) => (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -4 }}
                            key={color.name}
                            className="bg-white border border-gray-200 rounded-xl p-4 sm:p-8 shadow-[0_4px_20px_rgb(0,0,0,0.08)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all duration-500 group relative"
                          >
                            <div className="space-y-8 relative z-10">
                              {/* Header Row: Swatch, Name, and Image Management */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-gray-200">
                                <div className="flex items-center gap-5">
                                  <div className="relative">
                                    <div
                                      className="w-14 h-14 rounded-2xl border border-black/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] transition-all duration-700 group-hover:scale-110"
                                      style={{ backgroundColor: color.hex }}
                                    />
                                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white shadow-sm border border-gray-300 flex items-center justify-center">
                                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color.hex }} />
                                    </div>
                                  </div>
                                  <div className="flex flex-col">
                                    <h3 className="text-xl font-bold text-gray-900 tracking-tight leading-none mb-2">
                                      {color.name}
                                    </h3>
                                    <span className="text-[10px] text-gray-900 font-mono tracking-[0.2em] uppercase">
                                      {color.hex}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-6 sm:gap-10">
                                  <div 
                                    className="flex items-center gap-3 cursor-pointer group/assets" 
                                    onClick={() => setActiveImageTab(color.name)}
                                  >
                                    <div className="text-2xl font-bold text-gray-900 group-hover/assets:scale-110 transition-transform">
                                      {color.images.length}
                                    </div>
                                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-900">
                                      Specific <br /> Images
                                    </div>
                                  </div>

                                  <button
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setActiveImageTab(color.name);
                                      document.getElementById('image-studio')?.scrollIntoView({ behavior: 'smooth' });
                                      setTimeout(() => {
                                        fileInputRef.current?.click();
                                      }, 300);
                                    }}
                                    className="ml-auto sm:ml-0 py-2.5 px-6 rounded-md bg-black text-white border border-black text-[10px] font-bold uppercase tracking-widest transition-all duration-300 shadow-sm hover:shadow-lg whitespace-nowrap"
                                  >
                                    Edit Gallery
                                  </button>
                                </div>
                              </div>

                              {/* Footer Grid: Signature and Stock */}
                              <div className="grid grid-cols-[2fr_3fr] sm:grid-cols-2 gap-4 sm:gap-8">
                                <div className="space-y-3">
                                  <div className="flex items-center min-h-[40px] sm:h-10">
                                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-gray-900 leading-tight">
                                      <span className="sm:hidden">Variant<br />Signature</span>
                                      <span className="hidden sm:inline">Variant Signature</span>
                                    </span>
                                  </div>
                                  <div className="font-mono text-[11px] text-gray-900/80 bg-gray-900/5 px-3 h-10 flex items-center rounded-lg border border-primary/10 w-fit max-w-full break-all">
                                    {color.sku}
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-2 min-h-[40px] sm:h-10">
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-gray-900 leading-tight">
                                      <span className="sm:hidden">Stock<br />Level</span>
                                      <span className="hidden sm:inline">Stock Level</span>
                                    </label>

                                    <StockToggleSlider
                                      isUnlimited={!!color.isUnlimited}
                                      onChange={(unlimited) => toggleVariantStockMode(color.name, unlimited)}
                                      className="w-32 sm:w-40 h-8 sm:h-9 shrink-0"
                                      limitedLabel="Limited"
                                      unlimitedLabel="Unlimited"
                                      limitedLabelMobile="Ltd"
                                      unlimitedLabelMobile="Unltd"
                                    />
                                  </div>

                                  {color.isUnlimited ? (
                                    <div className="flex items-center justify-center h-10 w-52 sm:w-28 rounded-md border border-gray-300 bg-gray-50 text-sm font-medium font-body text-gray-800">
                                      Unlimited
                                    </div>
                                  ) : (
                                    <div className="group/input flex items-center h-10 w-52 sm:w-28 rounded-md border border-gray-300 bg-gray-50 overflow-hidden focus-within:border-[#B19CD9] transition-all">
                                      <button
                                        type="button"
                                        onClick={() => updateVariantStock(color.name, Math.max(1, (color.stock || 1) - 1))}
                                        className="h-full px-2.5 flex items-center justify-center text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed transition-colors shrink-0"
                                        aria-label="Decrease stock"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <input
                                        type="number"
                                        value={color.stock}
                                        onChange={(e) => updateVariantStock(color.name, parseInt(e.target.value) || 0)}
                                        className="flex-1 min-w-0 h-full bg-transparent border-x border-gray-300 px-1 outline-none text-sm font-medium font-body text-center text-gray-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder="1"
                                        min="1"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => updateVariantStock(color.name, (color.stock || 0) + 1)}
                                        className="h-full px-2.5 flex items-center justify-center text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed transition-colors shrink-0"
                                        aria-label="Increase stock"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Corner Action */}
                            <button
                              onClick={() => removeColor(color.name)}
                              className="absolute top-4 sm:top-1 right-4 sm:right-1 p-2.5 text-gray-800/70 hover:text-red-500 hover:bg-red-50 rounded-md transition-all z-20 opacity-100"
                            >
                              <X size={14} />
                            </button>
                          </motion.div>
                        ))
                      ) : (
                        <div className="p-8 sm:p-16 text-center border-2 border-dashed border-gray-300 rounded-[3rem] bg-secondary/5">
                          <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-6">
                            <Plus className="w-6 h-6 text-gray-800" />
                          </div>
                          <p className="text-sm text-gray-900 font-light italic max-w-xs mx-auto leading-relaxed">
                            No color variants curated yet. Begin by entering a color name or hex code above.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Image Assets Card */}
                <div className="space-y-6">
                  <div className="flex items-center gap-4" id="image-studio">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Image Studio</h2>
                  </div>

                  <div className="bg-white sm:rounded-[2.5rem] sm:border sm:border-gray-300 sm:shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden">
                    {/* Studio Header / Tabs */}
                    <div className="px-0 py-4 sm:px-8 sm:py-6 border-b border-gray-200 bg-white flex items-center justify-between gap-4">
                      <ImageTabSlider
                        className="flex-1 min-w-0"
                        value={activeImageTab}
                        onChange={(key) => setActiveImageTab(key)}
                        tabs={[
                          { key: "Global", label: "Global Images" },
                          ...formData.selectedColors.map((color) => ({
                            key: color.name,
                            label: color.name,
                            hex: color.hex,
                          })),
                        ]}
                      />
                      
                      <div className="hidden sm:block">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">
                          {activeImageTab === "Global" ? "Shared Gallery" : `${activeImageTab} Variant`}
                        </span>
                      </div>
                    </div>

                    {/* Studio Body */}
                    <div className="px-0 py-6 sm:p-8 space-y-8">
                      <motion.div
                        key={activeImageTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        whileHover={{ scale: 1.002 }}
                        className={`border-2 border-dashed rounded p-12 text-center transition-all duration-300 ${isDragging
                          ? "border-primary bg-gray-900/[0.02]"
                          : "border-gray-300 hover:border-primary/20 bg-gray-50"
                          }`}
                      >
                        <motion.div
                          animate={{ y: isDragging ? -5 : 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        >
                          <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-6">
                            <Upload className="w-6 h-6 text-gray-900" />
                          </div>
                          <p className="text-gray-900 font-display font-medium text-lg mb-2">
                            {activeImageTab === "Global" ? "Global Collection" : `${activeImageTab} Variant`}
                          </p>
                          <p className="text-sm text-gray-800 font-body font-light mb-8 max-w-xs mx-auto">
                            {activeImageTab === "Global" 
                              ? "Upload general campaign or shared editorial shots."
                              : `Upload exclusive shots for the ${activeImageTab} variant.`}
                          </p>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-10 py-3.5 rounded-md text-white hover:brightness-95 transition-all duration-300 text-[11px] font-bold uppercase tracking-widest shadow-xl"
                            style={{ backgroundColor: "#0B5B55" }}
                          >
                            Upload Content
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                        </motion.div>
                      </motion.div>

                      {/* Upload progress indicator */}
                      {uploadingCount > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 rounded bg-amber-50 border border-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-widest">
                          <Loader className="w-3 h-3 animate-spin shrink-0" />
                          Uploading {uploadingCount} image{uploadingCount > 1 ? "s" : ""} to CDN…
                        </div>
                      )}

                      {/* Studio Previews */}
                      {(() => {
                        const currentImages = activeImageTab === "Global"
                          ? imagePreviews
                          : formData.selectedColors.find(c => c.name === activeImageTab)?.images || [];
                        
                        if (currentImages.length === 0) return null;

                        return (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="h-px flex-1 bg-border/20" />
                              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900">Current Selections</span>
                              <div className="h-px flex-1 bg-border/20" />
                            </div>
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4"
                            >
                              {currentImages.map((preview, index) => (
                                <motion.div
                                  key={`${activeImageTab}-${index}`}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="relative group aspect-square rounded-2xl overflow-hidden bg-secondary/10 border border-gray-200"
                                >
                                  <img
                                    src={preview}
                                    alt={`Preview ${index}`}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                  <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => removeImage(index, activeImageTab)}
                                    className="absolute top-2 right-2 bg-white/90 backdrop-blur-md text-destructive rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </motion.button>
                                </motion.div>
                              ))}
                            </motion.div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Status & Publishing */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Status & Publishing</h2>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      {/* Core Badges */}
                      {[
                        { key: "newArrival", label: "New Arrival", icon: Zap },
                        { key: "featured", label: "Featured Product", icon: Star },
                        { key: "bestseller", label: "Bestseller", icon: TrendingUp },
                        { key: "trending", label: "Trending", icon: Flame },
                      ].map(({ key, label, icon: Icon }) => (
                        <motion.button
                          key={key}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => handleToggle(key as keyof FormData)}
                          className={`flex items-center justify-between gap-2 p-3 sm:p-5 rounded-2xl border transition-all duration-300 ${formData[key as keyof FormData]
                            ? "border-[#B19CD9] bg-[#B19CD9]/[0.02] shadow-xl shadow-[#B19CD9]/5"
                            : "border-gray-200 bg-gray-50 hover:border-[#B19CD9]/20"
                            }`}
                        >
                          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                            <div className={`w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${formData[key as keyof FormData] ? "bg-[#B19CD9]/20 text-gray-900" : "bg-white text-gray-900 shadow-sm"
                              }`}>
                              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <span className="font-display font-medium text-gray-900 text-xs sm:text-sm leading-tight text-left">{label}</span>
                          </div>
                          <div
                            className={`shrink-0 w-12 h-6 rounded-full transition-all duration-300 p-1 ${formData[key as keyof FormData] ? "bg-[#B19CD9]" : "bg-muted-foreground/20"
                              }`}
                          >
                            <motion.div
                              animate={{ x: formData[key as keyof FormData] ? 24 : 0 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              className="w-4 h-4 bg-white rounded-full shadow-sm"
                            />
                          </div>
                        </motion.button>
                      ))}

                      {/* Custom Badges */}
                      {availableCustomBadges.map((badge) => (
                        <motion.button
                          key={badge}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => toggleCustomBadge(badge)}
                          className={`flex items-center justify-between gap-2 p-3 sm:p-5 rounded-2xl border transition-all duration-300 ${formData.customBadges.includes(badge)
                            ? "border-[#B19CD9] bg-[#B19CD9]/[0.02] shadow-xl shadow-[#B19CD9]/5"
                            : "border-gray-200 bg-gray-50 hover:border-[#B19CD9]/20"
                            }`}
                        >
                          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                            <div className={`w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${formData.customBadges.includes(badge) ? "bg-[#B19CD9]/20 text-gray-900" : "bg-white text-gray-900 shadow-sm"
                              }`}>
                              <Tag className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <span lang="en" className="min-w-0 font-display font-medium text-gray-900 text-xs sm:text-sm leading-tight text-left [overflow-wrap:anywhere] hyphens-auto">{badge}</span>
                          </div>
                          <div
                            className={`shrink-0 w-12 h-6 rounded-full transition-all duration-300 p-1 ${formData.customBadges.includes(badge) ? "bg-[#B19CD9]" : "bg-muted-foreground/20"
                              }`}
                          >
                            <motion.div
                              animate={{ x: formData.customBadges.includes(badge) ? 24 : 0 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              className="w-4 h-4 bg-white rounded-full shadow-sm"
                            />
                          </div>
                        </motion.button>
                      ))}
                    </div>

                    {/* Create Badge Input */}
                    <div className="flex gap-3 pt-2">
                      <div className="relative flex-1 group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 group-focus-within:text-gray-900 transition-colors">
                          <Plus size={18} />
                        </div>
                        <input
                          type="text"
                          value={newBadgeName}
                          onChange={(e) => setNewBadgeName(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && createBadge()}
                          placeholder="Create custom badge (e.g. Limited Edition, Sustainable)..."
                          className="w-full pl-12 pr-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 focus:border-primary/50 outline-none transition-all duration-300 font-body text-base"
                        />
                      </div>
                      <button
                        onClick={createBadge}
                        className="shrink-0 min-w-[84px] sm:min-w-[120px] flex flex-col items-center justify-center px-4 sm:px-8 rounded-md bg-[#0B5B55] text-white font-bold text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-widest hover:brightness-110 transition-all shadow-lg shadow-teal-900/10 text-center leading-tight"
                      >
                        Create<br />Badge
                      </button>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-10">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSaveDraft}
                    disabled={isSaving || uploadingCount > 0}
                    className="flex-1 flex items-center justify-center gap-3 px-8 py-4 rounded-md border border-black bg-black text-white font-bold uppercase tracking-widest text-xs shadow-md hover:shadow-xl transition-all duration-300 disabled:opacity-50 group"
                  >
                    {isSaving ? (
                      <Loader className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Save className="w-4 h-4 text-white" />
                    )}
                    {isSaving ? "Saving..." : "Save Draft"}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePublish}
                    disabled={
                      isPublishing ||
                      uploadingCount > 0 ||
                      !formData.name ||
                      !formData.category ||
                      !formData.gender ||
                      !formData.sku
                    }
                    className={`flex-1 flex items-center justify-center gap-3 px-8 py-4 rounded-md font-bold uppercase tracking-widest text-xs transition-all duration-300 shadow-xl hover:shadow-2xl ${
                      !formData.name || !formData.category || !formData.gender || !formData.sku
                        ? "bg-gray-100 text-gray-800 cursor-not-allowed shadow-none border border-gray-400"
                        : "bg-[#B19CD9] text-black hover:brightness-105 shadow-[#B19CD9]/30"
                    } disabled:opacity-50 text-xs`}
                  >
                    {isPublishing ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {isPublishing ? "Launching..." : "Launch Product"}
                  </motion.button>
                </div>
              </div>
            </motion.div>

            {/* Live Preview Panel */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="lg:col-span-2 lg:sticky lg:top-32 h-fit"
            >
              <div className="bg-white rounded-lg border border-foreground/50 shadow-md px-4 py-3 space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-gray-300">
                  <h2 className="text-lg font-bold uppercase tracking-[0.15em] text-slate-900">
                    Live Preview
                  </h2>
                  <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-green-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span>Active</span>
                  </div>
                </div>

                {savedPreviewProduct ? (
                  <motion.div layout className="rounded-[1.5rem] overflow-hidden border border-gray-300 bg-white mx-[-6px]">
                    <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
                      <ProductPreviewView 
                        product={savedPreviewProduct} 
                        previewMode={true} 
                        forceMobileLayout={true} 
                        initialColorName={activeImageTab !== "Global" ? activeImageTab : undefined}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <div className="rounded-[1.5rem] border-2 border-dashed border-gray-300 bg-gray-50 p-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-6 h-6 text-gray-900" />
                    </div>
                    <p className="text-sm font-semibold text-gray-900 mb-1">Your Product Detail Preview Will Appear Here</p>
                    <p className="text-xs text-gray-800">Click Save Draft to generate the full customer page preview.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AddProduct;



