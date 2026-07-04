import { useEffect, useRef, useState } from "react";
import { invalidateAfterMutation } from "@/lib/catalogCache";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Upload,
  X,
  ChevronDown,
  ChevronRight,
  Zap,
  TrendingUp,
  Star,
  Save,
  Send,
  Loader,
  Search,
  Plus,
  Flame,
  Tag,
  Play,
  ArrowLeft
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/Footer";
import ProductPreviewView from "@/components/ProductPreviewView";
import StockToggleSlider from "@/components/StockToggleSlider";
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
  descriptionPoints: string[];
  selectedSizes: string[];
  selectedColors: {
    name: string;
    hex: string;
    sku: string;
    stock: number;
    isUnlimited?: boolean;
    images: string[];
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

function buildCurationPayload(formData: FormData, imagePreviews: string[], isStockUnlimited: boolean): Record<string, unknown> {
  return {
    name: formData.name,
    isStockUnlimited,
    brand: formData.brand,
    sku: formData.sku,
    slug: formData.slug,
    categorySlug: formData.categorySlug,
    category: formData.category,
    gender: formData.gender,
    price: formData.price,
    originalPrice: formData.originalPrice,
    fabric: formData.fabric,
    fit: formData.fit,
    occasion: formData.occasion,
    care_instructions: formData.care_instructions,
    descriptionPoints: formData.descriptionPoints,
    tags: formData.tags,
    selectedSizes: formData.selectedSizes,
    selectedColors: formData.selectedColors,
    customBadges: formData.customBadges,
    featured: formData.featured,
    newArrival: formData.newArrival,
    bestseller: formData.bestseller,
    trending: formData.trending,
    imagePreviews,
  };
}

type PersistDatabaseResult =
  | { ok: true; draftProductId?: string; publishedProductId?: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string };

async function sendCurationToBackend(
  status: "DRAFT" | "PUBLISHED",
  formData: FormData,
  imagePreviews: string[],
  isStockUnlimited: boolean
): Promise<{ database?: PersistDatabaseResult }> {
  const base = getBackendBaseUrl();
  const body = { status, ...buildCurationPayload(formData, imagePreviews, isStockUnlimited) };
  console.log(`[EditProduct] POST /api/products/preview  status=${status}  sku=${(body as { sku?: string }).sku ?? "?"}`);
  const res = await fetch(`${base}/api/products/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  console.log(`[EditProduct] preview → ${res.status}${res.status === 401 || res.status === 403 ? " (admin auth failed)" : ""}`);
  let json: {
    ok?: boolean;
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
  return { database: json.database };
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

interface EditableProduct {
  id: string;
  title: string;
  base_sku: string;
  category: string;
  category_slug: string;
  price: number;
  original_price?: number;
  status: "DRAFT" | "PUBLISHED";
  slug: string;
  brand: string;
  fabric?: string;
  fit?: string;
  occasion?: string;
  care_instructions?: string;
  description_points?: string[];
  gender?: string;
  sizes?: string[];
  tags?: string[];
  badges?: string[];
  is_featured?: boolean;
  is_new_arrival?: boolean;
  is_bestseller?: boolean;
  is_trending?: boolean;
  product_images?: ProductImageRow[];
  draft_product_images?: ProductImageRow[];
  product_variants?: ProductVariantRow[];
  draft_product_variants?: ProductVariantRow[];
}

interface ProductVariantRow {
  id: string;
  color_name?: string;
  color_hex?: string;
  variant_sku?: string;
  stock?: number | null;
  is_unlimited?: boolean;
}

interface ProductImageRow {
  id?: string;
  variant_id?: string | null;
  image_url: string;
}

interface EditSnapshot {
  formData: FormData;
  globalImages: string[];
  isStockUnlimited: boolean;
}

const EditProduct = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [newPoint, setNewPoint] = useState("");
  const [newColorInput, setNewColorInput] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newBadgeName, setNewBadgeName] = useState("");
  const [availableCustomBadges, setAvailableCustomBadges] = useState<string[]>([]);
  const [originalProduct, setOriginalProduct] = useState<EditableProduct | null>(null);
  const [initialState, setInitialState] = useState<EditSnapshot | null>(null);

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
  const [savedPreviewProduct, setSavedPreviewProduct] = useState<Product | null>(null);
  const [previewActivated, setPreviewActivated] = useState(false);
  const [activeImageTab, setActiveImageTab] = useState<"Global" | string>("Global");
  const [isStockUnlimited, setIsStockUnlimited] = useState(false);

  // Load product data from backend
  useEffect(() => {
    const loadProduct = async () => {
      if (!productId) {
        navigate("/admin/manage-products");
        return;
      }

      try {
        const base = getBackendBaseUrl();
        const res = await fetch(`${base}/api/products`, {
          headers: { ...(await authHeader()) },
        });
        if (!res.ok) throw new Error("Failed to fetch products");
        const data = await res.json();

        const published = (data.published || []).map((p: EditableProduct) => ({ ...p, status: "PUBLISHED" }));
        const drafts = (data.drafts || []).map((d: EditableProduct) => ({ ...d, status: "DRAFT" }));
        const allProducts = [...published, ...drafts];
        const product = allProducts.find((p: EditableProduct) => p.id === productId);

        if (!product) {
          toast.error("Product not found");
          navigate("/admin/manage-products");
          return;
        }

        setOriginalProduct(product);

        const images = product.status === "PUBLISHED" ? product.product_images : product.draft_product_images || [];
        const variants = product.status === "PUBLISHED" ? product.product_variants : product.draft_product_variants || [];

        const initialFormValues = {
          name: product.title || "",
          brand: product.brand || "The Lil Edit",
          sku: product.base_sku || "",
          category: product.category || "",
          gender: product.gender || "",
          price: String(product.price ?? ""),
          originalPrice: String(product.original_price ?? ""),
          tags: product.tags || [],
          fabric: product.fabric || "",
          fit: product.fit || "",
          occasion: product.occasion || "",
          care_instructions: product.care_instructions || "",
          descriptionPoints: (product.description_points || []).filter((pt: string) => pt !== "No product details added yet."),
          selectedSizes: product.sizes || [],
          selectedColors: (variants || []).map((v: ProductVariantRow) => ({
            name: v.color_name || "Color",
            hex: v.color_hex || "#cccccc",
            sku: v.variant_sku || "",
            stock: v.is_unlimited ? 0 : Number(v.stock ?? 0),
            isUnlimited: !!v.is_unlimited,
            images: (images || []).filter((img: ProductImageRow) => img.variant_id === v.id).map((img: ProductImageRow) => img.image_url) || []
          })),
          featured: product.is_featured || false,
          newArrival: product.is_new_arrival || false,
          bestseller: product.is_bestseller || false,
          trending: product.is_trending || false,
          customBadges: product.badges || [],
          slug: product.slug || "",
          categorySlug: product.category_slug || "",
        };

        setFormData(initialFormValues);

        const globalImages = (images || []).filter((img: ProductImageRow) => !img.variant_id).map((img: ProductImageRow) => img.image_url);
        setImagePreviews(globalImages);

        setAvailableCustomBadges(product.badges || []);

        const isUnlimited = variants.some((v: ProductVariantRow) => !!v.is_unlimited);
        setIsStockUnlimited(isUnlimited);

        setInitialState({
          formData: initialFormValues,
          globalImages,
          isStockUnlimited: isUnlimited
        });

        // Generate and display preview immediately
        const previewProduct = mapFormDataToProduct(
          {
            name: product.title || "",
            brand: product.brand || "The Lil Edit",
            sku: product.base_sku || "",
            category: product.category || "",
            gender: product.gender || "",
            price: String(product.price ?? ""),
            originalPrice: String(product.original_price ?? ""),
            tags: product.tags || [],
            fabric: product.fabric || "",
            fit: product.fit || "",
            occasion: product.occasion || "",
            care_instructions: product.care_instructions || "",
            descriptionPoints: (product.description_points || []).filter((pt: string) => pt !== "No product details added yet."),
            selectedSizes: product.sizes || [],
            selectedColors: (variants || []).map((v: ProductVariantRow) => ({
              name: v.color_name || "Color",
              hex: v.color_hex || "#cccccc",
              sku: v.variant_sku || "",
              stock: v.is_unlimited ? 0 : Number(v.stock ?? 0),
              isUnlimited: !!v.is_unlimited,
              images: (images || []).filter((img: ProductImageRow) => img.variant_id === v.id).map((img: ProductImageRow) => img.image_url) || []
            })),
            featured: product.is_featured || false,
            newArrival: product.is_new_arrival || false,
            bestseller: product.is_bestseller || false,
            trending: product.is_trending || false,
            customBadges: product.badges || [],
            slug: product.slug || "",
            categorySlug: product.category_slug || "",
          },
          globalImages
        );
        setSavedPreviewProduct(previewProduct);
        setPreviewActivated(true);

        setIsLoading(false);
      } catch (err) {
        console.error("Error loading product:", err);
        toast.error(err instanceof Error ? err.message : "Failed to load product");
        setIsLoading(false);
      }
    };

    loadProduct();
  }, [productId, navigate]);

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

  const addColor = () => {
    if (newColorInput.trim()) {
      let name = "";
      let hex = "";

      if (newColorInput.includes("#")) {
        const parts = newColorInput.split("#");
        name = parts[0].trim();
        hex = `#${parts[1].trim()}`;

        if (!name) {
          name = HEX_TO_NAME[hex.toUpperCase()] || "Custom Color";
        }
      } else {
        const input = newColorInput.trim();
        const matchedHex = COLOR_MAP[input.charAt(0).toUpperCase() + input.slice(1).toLowerCase()];

        if (matchedHex) {
          name = input;
          hex = matchedHex;
        } else if (/^[0-9A-F]{6}$/i.test(input)) {
          hex = `#${input.toUpperCase()}`;
          name = HEX_TO_NAME[hex] || "Custom Color";
        } else {
          name = input;
          hex = input.toLowerCase();
        }
      }

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

  const hasFormChanged = (): boolean => {
    if (!initialState) return false;

    // 1. Basic Fields
    const fields = [
      "name", "brand", "sku", "category", "gender", "price", "originalPrice",
      "fabric", "fit", "occasion", "care_instructions", "featured", "newArrival", "bestseller",
      "trending", "slug", "categorySlug"
    ];
    for (const f of fields) {
      if (formData[f as keyof typeof formData] !== initialState.formData[f as keyof FormData]) {
        return true;
      }
    }

    // 2. Arrays
    const arrayFields = ["tags", "descriptionPoints", "selectedSizes", "customBadges"];
    for (const f of arrayFields) {
      const arr1 = formData[f as keyof typeof formData] as string[];
      const arr2 = initialState.formData[f as keyof FormData] as string[];
      const sorted1 = [...(arr1 || [])].sort();
      const sorted2 = [...(arr2 || [])].sort();
      if (sorted1.length !== sorted2.length || JSON.stringify(sorted1) !== JSON.stringify(sorted2)) {
        return true;
      }
    }

    // 3. Global Images (imagePreviews vs initialState.globalImages)
    if (imagePreviews.length !== initialState.globalImages.length || JSON.stringify([...imagePreviews].sort()) !== JSON.stringify([...initialState.globalImages].sort())) {
      return true;
    }

    // 4. Stock Unlimited Toggle
    if (isStockUnlimited !== initialState.isStockUnlimited) {
      return true;
    }

    // 5. Variants (selectedColors)
    const colors1 = formData.selectedColors || [];
    const colors2 = initialState.formData.selectedColors || [];
    if (colors1.length !== colors2.length) return true;

    for (let i = 0; i < colors1.length; i++) {
      const c1 = colors1[i];
      const c2 = colors2[i];
      if (c1.name !== c2.name || c1.hex !== c2.hex || c1.sku !== c2.sku || c1.isUnlimited !== c2.isUnlimited || c1.stock !== c2.stock) {
        return true;
      }
      const imgs1 = c1.images || [];
      const imgs2 = c2.images || [];
      if (imgs1.length !== imgs2.length || JSON.stringify([...imgs1].sort()) !== JSON.stringify([...imgs2].sort())) {
        return true;
      }
    }

    return false;
  };

  const handleSaveDraft = async () => {
    if (!validateForm()) return;

    if (!hasFormChanged()) {
      toast.warning("No changes were made when clicking Save Draft.");
      return;
    }

    setIsSaving(true);
    try {
      const updatedFormData = { ...formData };

      const { database } = await sendCurationToBackend("DRAFT", updatedFormData, imagePreviews, isStockUnlimited);
      const mappedProduct = mapFormDataToProduct(updatedFormData, imagePreviews, isStockUnlimited);
      setSavedPreviewProduct(mappedProduct);
      setPreviewActivated(true);

      // Update form data to reflect the tag
      setFormData(updatedFormData);

      if (database && database.ok === false && "skipped" in database && database.skipped) {
        toast.warning(database.reason);
      } else {
        toast.success("Changes saved to drafts!");
        invalidateAfterMutation(formData.sku || undefined);
        setInitialState({
          formData: JSON.parse(JSON.stringify(updatedFormData)),
          globalImages: [...imagePreviews],
          isStockUnlimited
        });
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
      const updatedFormData = { ...formData };

      const { database } = await sendCurationToBackend("PUBLISHED", updatedFormData, imagePreviews, isStockUnlimited);
      const mappedProduct = mapFormDataToProduct(updatedFormData, imagePreviews, isStockUnlimited);
      setSavedPreviewProduct(mappedProduct);
      setPreviewActivated(true);
      if (database && database.ok === false && "skipped" in database && database.skipped) {
        toast.warning(database.reason);
      } else {
        toast.success(`"${formData.name}" has been updated and launched!`);
        invalidateAfterMutation(formData.sku || undefined);
        setTimeout(() => {
          navigate("/admin/manage-products");
        }, 1500);
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

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      slug: slugify(prev.name),
      categorySlug: slugify(prev.category)
    }));
  }, [formData.name, formData.category]);



  if (authLoading || isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden w-full selection:bg-gray-900/20">
      {user ? <UserNavbar /> : <Navbar />}

      {/* Sticky "Back to Catalog" bar — fixed below the navbar */}
      <div
        className="fixed left-0 right-0 z-40 bg-white/95 backdrop-blur-sm"
        style={{ top: "var(--navbar-height, 80px)" }}
      >
        <div className="px-4 sm:px-8 lg:px-12 xl:px-20 py-2.5">
          <button
            onClick={() => navigate("/admin/manage-products")}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors uppercase tracking-widest"
          >
            <ArrowLeft size={13} /> Back to Catalog
          </button>
        </div>
      </div>

      <div className="pt-[200px] md:pt-[168px] pb-24 px-3 sm:px-8 lg:px-12 xl:px-20">
        <div className="mx-auto max-w-none">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8 space-y-1"
          >
            <div className="flex flex-wrap items-center text-base text-gray-500 gap-1 mb-3">
              <Link to="/" className="hover:underline">
                Home
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-800 font-medium">Edit Product</span>
            </div>
            <p className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: "#B19CD9" }}>
              Versioning
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Edit Product
            </h1>
            {originalProduct && (
              <p className="text-sm text-gray-500 mt-2">
                Current Status: <span className={`font-semibold ${originalProduct.status === "PUBLISHED" ? "text-green-600" : "text-amber-600"}`}>
                  {originalProduct.status}
                </span>
              </p>
            )}
          </motion.div>

          <hr className="-mx-3 sm:-mx-8 lg:-mx-12 xl:-mx-20 mb-8 border-t border-foreground/50" />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="lg:col-span-3"
            >
              <div className="bg-white rounded-lg border border-black shadow-md p-4 sm:p-10 space-y-12">
                {/* Essential Details */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#B19CD9" }} />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Essential Details</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <motion.div className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2">
                        Product Title <span className="text-gray-300 normal-case tracking-normal">(locked)</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        readOnly
                        placeholder="e.g. Criss-Cross Back Knot Top"
                        className="w-full px-5 py-4 rounded-md border border-sky-200 bg-sky-50 text-gray-800 cursor-not-allowed outline-none transition-all duration-300 font-body text-base"
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
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Specifications */}
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
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
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
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
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
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
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
                        className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Product Details */}
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
                        className="flex-1 px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-primary/50 outline-none transition-all duration-300 font-body text-base"
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
                    <motion.div className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2">
                        Category <span className="text-gray-300 normal-case tracking-normal">(locked)</span>
                      </label>
                      <div className="relative">
                        <select
                          name="category"
                          value={formData.category}
                          disabled
                          className="w-full px-5 py-4 rounded-md border border-sky-200 bg-sky-50 text-gray-800 cursor-not-allowed outline-none appearance-none transition-all duration-300 font-body text-base"
                        >
                          <option value="">Select a category</option>
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                      </div>
                    </motion.div>

                    <motion.div className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-800 mb-2">
                        Gender Category <span className="text-gray-300 normal-case tracking-normal">(locked)</span>
                      </label>
                      <div className="relative">
                        <select
                          name="gender"
                          value={formData.gender}
                          disabled
                          className="w-full px-5 py-4 rounded-md border border-sky-200 bg-sky-50 text-gray-800 cursor-not-allowed outline-none appearance-none transition-all duration-300 font-body text-base"
                        >
                          <option value="">Select gender</option>
                          {GENDERS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                      </div>
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
                          className="w-full pl-8 pr-4 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
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
                          className="w-full pl-8 pr-4 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-gray-900 outline-none transition-all duration-300 font-body text-base"
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

                {/* Inventory Control */}
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
                          placeholder="Select category & gender"
                          className={`w-full px-5 py-4 rounded-md border border-sky-200 bg-sky-50 text-gray-800 cursor-not-allowed outline-none transition-all duration-300 font-mono text-[13px] tracking-wider`}
                        />
                        {formData.sku && (
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
                          className="w-full pl-12 pr-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-primary/50 outline-none transition-all duration-300 font-body text-base"
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

                {/* Available Sizes */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Available Sizes</h2>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    {SIZES.map((size) => (
                      <motion.button
                        key={size}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleSize(size)}
                        className={`px-6 py-3 rounded-md font-display font-medium text-sm transition-all duration-300 border ${formData.selectedSizes.includes(size)
                          ? "border-[#9E86C9] bg-[#B19CD9] text-black shadow-md shadow-purple-900/10"
                          : "border-gray-200 bg-gray-50 text-gray-900 hover:border-[#B19CD9]/30"
                          }`}
                      >
                        {size}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Color Palette */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Color Palette</h2>
                  </div>

                  <div className="space-y-6">
                    <div className="flex gap-3">
                      <div className="relative flex-1 group">
                        <input
                          type="text"
                          value={newColorInput}
                          onChange={(e) => setNewColorInput(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && addColor()}
                          placeholder="Type 'Lavender', '#E6E6FA', or 'Lavender #E6E6FA'..."
                          className="w-full px-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-primary/50 outline-none transition-all duration-300 font-body text-base"
                        />
                      </div>
                      <button
                        onClick={addColor}
                        className="shrink-0 min-w-[84px] sm:min-w-[120px] flex flex-col items-center justify-center px-4 sm:px-8 rounded-md bg-[#0B5B55] text-white font-bold text-[11px] sm:text-xs uppercase tracking-wide sm:tracking-widest hover:brightness-110 transition-all shadow-lg shadow-teal-900/10 text-center leading-tight"
                      >
                        Add<br />Color
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                      {formData.selectedColors.length > 0 ? (
                        formData.selectedColors.map((color) => (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -4 }}
                            key={color.name}
                            className="bg-white border border-gray-200 rounded-[2.5rem] p-8 shadow-[0_4px_20px_rgb(0,0,0,0.08)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] transition-all duration-500 group relative"
                          >
                            <div className="space-y-8 relative z-10">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-gray-200">
                                <div className="flex items-center gap-5">
                                  <div className="relative">
                                    <div
                                      className="w-14 h-14 rounded-2xl border border-black/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] transition-all duration-700 group-hover:scale-110"
                                      style={{ backgroundColor: color.hex }}
                                    />
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
                                    className="py-2.5 px-6 rounded-full bg-black text-white border border-black text-[10px] font-bold uppercase tracking-widest transition-all duration-300 shadow-sm hover:shadow-lg whitespace-nowrap"
                                  >
                                    Edit Gallery
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                  <div className="flex items-center h-10">
                                    <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-gray-900 block">Variant Signature</span>
                                  </div>
                                  <div className="font-mono text-[11px] text-gray-900/80 bg-gray-900/5 px-3 py-1.5 rounded-lg border border-primary/10 w-fit">
                                    {color.sku}
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <div className="flex items-center justify-between h-10">
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-gray-900 block">
                                      {color.isUnlimited ? "Stock Level (Auto)" : "Stock Level"}
                                    </label>

                                    <StockToggleSlider
                                      isUnlimited={!!color.isUnlimited}
                                      onChange={(unlimited) => toggleVariantStockMode(color.name, unlimited)}
                                      className="w-40 h-9"
                                    />
                                  </div>

                                  <div className="relative group/input">
                                    <input
                                      type="number"
                                      value={color.isUnlimited ? "" : color.stock}
                                      onChange={(e) => updateVariantStock(color.name, parseInt(e.target.value) || 0)}
                                      disabled={color.isUnlimited}
                                      className={`w-full bg-transparent border-b border-gray-300 focus:border-[#B19CD9] outline-none transition-all py-1 text-sm font-medium font-body ${color.isUnlimited ? 'text-gray-800 opacity-50' : 'text-gray-900 opacity-100'}`}
                                      placeholder={color.isUnlimited ? "Unlimited" : "1"}
                                      min="1"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => removeColor(color.name)}
                              className="absolute top-4 right-4 p-2.5 text-gray-800/20 hover:text-red-500 hover:bg-red-50 rounded-md transition-all z-20 opacity-0 group-hover:opacity-100"
                            >
                              <X size={14} />
                            </button>
                          </motion.div>
                        ))
                      ) : (
                        <div className="p-16 text-center border-2 border-dashed border-gray-300 rounded-[3rem] bg-secondary/5">
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

                {/* Image Studio */}
                <div className="space-y-6">
                  <div className="flex items-center gap-4" id="image-studio">
                    <div className="w-2 h-2 rounded-full bg-[#B19CD9]" />
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Image Studio</h2>
                  </div>

                  <div className="bg-white sm:rounded-[2.5rem] sm:border sm:border-gray-300 sm:shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden">
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

                      {availableCustomBadges.filter(b => b !== "Updates yet to be synced").map((badge) => (
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
                          className="w-full pl-12 pr-5 py-4 rounded-md border border-gray-300 bg-gray-50 focus:bg-white [&:not(:placeholder-shown)]:bg-sky-50 [&:not(:placeholder-shown)]:border-sky-200 focus:border-primary/50 outline-none transition-all duration-300 font-body text-base"
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
                    className={`flex-1 flex items-center justify-center gap-3 px-8 py-4 rounded-md font-bold uppercase tracking-widest text-xs transition-all duration-300 shadow-xl hover:shadow-2xl ${!formData.name || !formData.category || !formData.gender || !formData.sku
                        ? "bg-gray-100 text-gray-800 cursor-not-allowed shadow-none border border-gray-400"
                        : "bg-[#B19CD9] text-black hover:brightness-105 shadow-[#B19CD9]/30"
                      } disabled:opacity-50`}
                  >
                    {isPublishing ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {isPublishing ? "Updating..." : "Update & Launch"}
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
              <div className="bg-white rounded-lg border border-black shadow-md px-4 py-3 space-y-4">
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

export default EditProduct;
