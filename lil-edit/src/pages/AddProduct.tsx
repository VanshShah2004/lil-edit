import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Upload,
  X,
  ChevronDown,
  Eye,
  EyeOff,
  Zap,
  TrendingUp,
  Star,
  Save,
  Send,
  Loader,
  Search,
  Plus,
  Flame,
  Tag
} from "lucide-react";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";

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
  "Kids Ethnic Wear",
  "Party Wear",
  "Casual Wear",
  "Nightwear",
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
  stock: string;
  tags: string[];
  fabric: string;
  fit: string;
  occasion: string;
  care: string;
  descriptionPoints: string[];
  selectedSizes: string[];
  selectedColors: { name: string; hex: string }[];
  featured: boolean;
  newArrival: boolean;
  bestseller: boolean;
  trending: boolean;
  customBadges: string[];
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

const AddProduct = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
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
    stock: "",
    tags: [],
    fabric: "",
    fit: "",
    occasion: "",
    care: "",
    descriptionPoints: [],
    selectedSizes: [],
    selectedColors: [],
    featured: false,
    newArrival: false,
    bestseller: false,
    trending: false,
    customBadges: [],
  });

  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

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
    setFormData((prev) => ({
      ...prev,
      selectedSizes: prev.selectedSizes.includes(size)
        ? prev.selectedSizes.filter((s) => s !== size)
        : [...prev.selectedSizes, size],
    }));
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

      setFormData(prev => ({
        ...prev,
        selectedColors: [...prev.selectedColors, { name, hex }]
      }));
      setNewColorInput("");
    }
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

  const processFiles = (files: FileList) => {
    const newFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    setImages((prev) => [...prev, ...newFiles]);

    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreviews((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateDiscount = () => {
    if (!formData.price || !formData.originalPrice) return 0;
    const selling = parseFloat(formData.price);
    const original = parseFloat(formData.originalPrice);
    if (original <= selling) return 0;
    return Math.round(((original - selling) / original) * 100);
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Draft saved:", formData);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Product published:", formData);
    } finally {
      setIsPublishing(false);
    }
  };

  const discountPercent = calculateDiscount();

  return (
    <div className="min-h-screen bg-[#FDFCFD] overflow-x-hidden w-full selection:bg-primary/20">
      <UserNavbar />
      <div className="pt-[160px] md:pt-[128px] pb-24 px-4 sm:px-8 lg:px-12 xl:px-20">
        <div className="mx-auto max-w-none">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
                Curation Studio
              </span>
              <div className="h-px w-8 bg-primary/20" />
            </div>
            <h1 className="text-4xl font-display font-medium text-foreground tracking-tight">
              Add & Curate Products
            </h1>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="lg:col-span-2"
            >
              <div className="bg-white rounded-[2rem] border border-border/60 shadow-[0_8px_40px_rgb(0,0,0,0.06)] p-10 space-y-12">
                {/* Basic Info */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Essential Details</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Product Title
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="e.g. Criss-Cross Back Knot Top"
                        className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Brand House
                      </label>
                      <input
                        type="text"
                        name="brand"
                        value={formData.brand}
                        onChange={handleInputChange}
                        placeholder="e.g. Atelier Edit"
                        className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Editorial Specifications */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Specifications</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Fabric & Lining
                      </label>
                      <input
                        type="text"
                        name="fabric"
                        value={formData.fabric}
                        onChange={handleInputChange}
                        placeholder="e.g. Organza with Cotton Lining"
                        className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Silhouette & Fit
                      </label>
                      <input
                        type="text"
                        name="fit"
                        value={formData.fit}
                        onChange={handleInputChange}
                        placeholder="e.g. Regular Fit"
                        className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Occasion
                      </label>
                      <input
                        type="text"
                        name="occasion"
                        value={formData.occasion}
                        onChange={handleInputChange}
                        placeholder="e.g. Festive, Wedding"
                        className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Care Instructions
                      </label>
                      <input
                        type="text"
                        name="care"
                        value={formData.care}
                        onChange={handleInputChange}
                        placeholder="e.g. Dry Clean Only"
                        className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Description Points */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Product Details</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={newPoint}
                        onChange={(e) => setNewPoint(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && addDescriptionPoint()}
                        placeholder="Add a product feature or note..."
                        className="flex-1 px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 outline-none transition-all duration-300 font-body text-[15px]"
                      />
                      <button
                        onClick={addDescriptionPoint}
                        className="px-6 py-4 rounded-xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:brightness-95 transition-all"
                      >
                        Add
                      </button>
                    </div>

                    <div className="space-y-3">
                      {formData.descriptionPoints.map((point, idx) => (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={idx}
                          className="flex items-center justify-between gap-4 p-4 bg-[#F9F8FA] border border-border/40 rounded-xl group hover:border-primary/20 hover:bg-white transition-all duration-300 shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span className="text-[13px] text-foreground font-body leading-relaxed">{point}</span>
                          </div>
                          <button
                            onClick={() => removeDescriptionPoint(idx)}
                            className="p-2 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Classification</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Category
                      </label>
                      <div className="relative">
                        <select
                          name="category"
                          value={formData.category}
                          onChange={handleInputChange}
                          className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none appearance-none transition-all duration-300 font-body text-[15px]"
                        >
                          <option value="">Select a category</option>
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Gender Category
                      </label>
                      <div className="relative">
                        <select
                          name="gender"
                          value={formData.gender}
                          onChange={handleInputChange}
                          className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none appearance-none transition-all duration-300 font-body text-[15px]"
                        >
                          <option value="">Select gender</option>
                          {GENDERS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Pricing */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Pricing</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Original Price (MRP)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 font-body">₹</span>
                        <input
                          type="number"
                          name="originalPrice"
                          value={formData.originalPrice}
                          onChange={handleInputChange}
                          placeholder="0.00"
                          className="w-full pl-8 pr-4 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                        />
                      </div>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Selling Price
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 font-body">₹</span>
                        <input
                          type="number"
                          name="price"
                          value={formData.price}
                          onChange={handleInputChange}
                          placeholder="0.00"
                          className="w-full pl-8 pr-4 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                        />
                      </div>
                    </motion.div>

                    {discountPercent > 0 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-end pb-1"
                      >
                        <div className="px-4 py-3 bg-red-500/5 border border-red-500/10 rounded-xl w-full text-center">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-red-500/60 mb-0.5">Markdown</p>
                          <p className="text-xl font-display font-medium text-red-500">{discountPercent}% OFF</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Inventory */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Inventory Control</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Stock Level
                      </label>
                      <input
                        type="number"
                        name="stock"
                        value={formData.stock}
                        onChange={handleInputChange}
                        placeholder="0"
                        min="0"
                        className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                      />
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        SKU Signature
                      </label>
                      <input
                        type="text"
                        name="sku"
                        value={formData.sku}
                        onChange={handleInputChange}
                        placeholder="e.g. SKU-EDIT-001"
                        className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                      />
                    </motion.div>
                  </div>
                </div>

                {/* Tags */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Search & Discovery</h2>
                  </div>

                  <div className="space-y-6">
                    <div className="flex gap-3">
                      <div className="relative flex-1 group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                          <Search size={18} />
                        </div>
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && addTag()}
                          placeholder="Add discovery tags (e.g. Minimalist, Organic)..."
                          className="w-full pl-12 pr-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 outline-none transition-all duration-300 font-body text-[15px]"
                        />
                      </div>
                      <button
                        onClick={addTag}
                        className="px-8 py-4 rounded-xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:brightness-95 transition-all shadow-lg shadow-primary/10"
                      >
                        Add Tag
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 min-h-[48px] p-2 rounded-2xl border border-dashed border-border/20 bg-secondary/5">
                      {formData.tags.length > 0 ? (
                        formData.tags.map((tag) => (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={tag}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-border/50 rounded-full text-[11px] font-bold text-primary uppercase tracking-widest shadow-sm hover:shadow-md transition-all group"
                          >
                            {tag}
                            <button
                              onClick={() => removeTag(tag)}
                              className="text-muted-foreground/40 hover:text-red-500 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </motion.div>
                        ))
                      ) : (
                        <div className="w-full flex items-center justify-center py-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">No tags defined</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sizes */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Available Sizes</h2>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    {SIZES.map((size) => (
                      <motion.button
                        key={size}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleSize(size)}
                        className={`px-6 py-3 rounded-xl font-display font-medium text-sm transition-all duration-300 border ${formData.selectedSizes.includes(size)
                          ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                          : "border-border/50 bg-[#F9F8FA] text-foreground hover:border-primary/30"
                          }`}
                      >
                        {size}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Colors */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Color Palette</h2>
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
                          className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 outline-none transition-all duration-300 font-body text-[15px]"
                        />
                      </div>
                      <button
                        onClick={addColor}
                        className="px-8 py-4 rounded-xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:brightness-95 transition-all shadow-lg shadow-primary/10"
                      >
                        Add Color
                      </button>
                    </div>

                    {/* Selected Colors List */}
                    <div className="space-y-3">
                      {formData.selectedColors.length > 0 ? (
                        formData.selectedColors.map((color) => (
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={color.name}
                            className="flex items-center justify-between gap-4 p-4 bg-[#F9F8FA] border border-border/40 rounded-xl group hover:border-primary/20 hover:bg-white transition-all duration-300 shadow-sm hover:shadow-md"
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className="w-10 h-10 rounded-full border border-border/20 shadow-inner transform group-hover:scale-110 transition-transform"
                                style={{ backgroundColor: color.hex }}
                              />
                              <div className="flex flex-col">
                                <span className="text-[13px] font-bold text-foreground">{color.name}</span>
                                <span className="text-[10px] text-muted-foreground/60 font-mono tracking-tighter uppercase">{color.hex}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => removeColor(color.name)}
                              className="p-2 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <X size={16} />
                            </button>
                          </motion.div>
                        ))
                      ) : (
                        <div className="p-12 text-center border-2 border-dashed border-border/20 rounded-[2rem] bg-secondary/5">
                          <p className="text-sm text-muted-foreground/60 font-light italic">No colors added for this listing yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Images */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Images</h2>
                  </div>

                  <motion.div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    whileHover={{ scale: 1.005 }}
                    className={`border-2 border-dashed rounded-[2rem] p-12 text-center transition-all duration-300 ${isDragging
                      ? "border-primary bg-primary/[0.02]"
                      : "border-border/30 hover:border-primary/20 bg-[#F9F8FA]"
                      }`}
                  >
                    <motion.div
                      animate={{ y: isDragging ? -5 : 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                      <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-6">
                        <Upload className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-foreground font-display font-medium text-lg mb-2">Upload Images</p>
                      <p className="text-sm text-muted-foreground font-body font-light mb-8 max-w-xs mx-auto">
                        Drag & drop high-resolution JPG/PNG assets here or select from your gallery.
                      </p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-8 py-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 text-sm font-bold uppercase tracking-widest shadow-lg shadow-primary/20"
                      >
                        Browse Gallery
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

                  {/* Image Previews */}
                  {imagePreviews.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-3 sm:grid-cols-4 gap-4"
                    >
                      {imagePreviews.map((preview, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="relative group aspect-square rounded-2xl overflow-hidden bg-secondary/20 border border-border/10"
                        >
                          <img
                            src={preview}
                            alt={`Preview ${index}`}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => removeImage(index)}
                            className="absolute top-2 right-2 bg-white/90 backdrop-blur-md text-destructive rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          >
                            <X className="w-3 h-3" />
                          </motion.button>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </div>

                {/* Status & Publishing */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Status & Publishing</h2>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          className={`flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${formData[key as keyof FormData]
                            ? "border-primary bg-primary/[0.02] shadow-xl shadow-primary/5"
                            : "border-border/50 bg-[#F9F8FA] hover:border-primary/20"
                            }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${formData[key as keyof FormData] ? "bg-primary/10 text-primary" : "bg-white text-muted-foreground/40 shadow-sm"
                              }`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <span className="font-display font-medium text-foreground text-sm">{label}</span>
                          </div>
                          <div
                            className={`w-12 h-6 rounded-full transition-all duration-300 p-1 ${formData[key as keyof FormData] ? "bg-primary" : "bg-muted-foreground/20"
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
                          className={`flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 ${formData.customBadges.includes(badge)
                            ? "border-primary bg-primary/[0.02] shadow-xl shadow-primary/5"
                            : "border-border/50 bg-[#F9F8FA] hover:border-primary/20"
                            }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${formData.customBadges.includes(badge) ? "bg-primary/10 text-primary" : "bg-white text-muted-foreground/40 shadow-sm"
                              }`}>
                              <Tag className="w-5 h-5" />
                            </div>
                            <span className="font-display font-medium text-foreground text-sm">{badge}</span>
                          </div>
                          <div
                            className={`w-12 h-6 rounded-full transition-all duration-300 p-1 ${formData.customBadges.includes(badge) ? "bg-primary" : "bg-muted-foreground/20"
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
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-primary transition-colors">
                          <Plus size={18} />
                        </div>
                        <input
                          type="text"
                          value={newBadgeName}
                          onChange={(e) => setNewBadgeName(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && createBadge()}
                          placeholder="Create custom badge (e.g. Limited Edition, Sustainable)..."
                          className="w-full pl-12 pr-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 outline-none transition-all duration-300 font-body text-[15px]"
                        />
                      </div>
                      <button
                        onClick={createBadge}
                        className="px-8 py-4 rounded-xl bg-secondary text-foreground font-bold text-xs uppercase tracking-widest hover:bg-border/20 transition-all border border-border/40"
                      >
                        Create Badge
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
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-3 px-8 py-4 rounded-full border border-border/60 text-foreground font-bold uppercase tracking-widest text-xs hover:bg-secondary transition-all duration-300 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader className="w-4 h-4 animate-spin text-primary" />
                    ) : (
                      <Save className="w-4 h-4 text-primary" />
                    )}
                    {isSaving ? "Saving..." : "Save Draft"}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePublish}
                    disabled={isPublishing}
                    className="flex-1 flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-widest text-xs hover:bg-primary/90 transition-all duration-300 disabled:opacity-50 shadow-xl shadow-primary/20"
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
              className="lg:sticky lg:top-32 h-fit"
            >
              <div className="bg-white rounded-[2rem] border border-border/60 shadow-[0_8px_40px_rgb(0,0,0,0.06)] p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Live Preview</h2>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-green-600">Active</span>
                  </div>
                </div>

                {/* Product Card Preview */}
                <motion.div
                  layout
                  className="rounded-[1.5rem] overflow-hidden border border-border/30 bg-[#F9F8FA] hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500"
                >
                  {/* Image Preview */}
                  {imagePreviews.length > 0 ? (
                    <div className="relative w-full aspect-[4/5] bg-secondary overflow-hidden group">
                      <img
                        src={imagePreviews[0]}
                        alt="Product preview"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      {discountPercent > 0 && (
                        <div className="absolute top-4 right-4 bg-red-500 text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg">
                          -{discountPercent}%
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full aspect-[4/5] bg-gradient-to-br from-[#F9F8FA] to-[#F1F0F5] flex items-center justify-center border-b border-border/20">
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-4">
                          <Upload className="w-5 h-5 text-muted-foreground/30" />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Visual pending</p>
                      </div>
                    </div>
                  )}

                  {/* Product Info */}
                  <div className="p-6 space-y-4">
                    <div className="space-y-1.5">
                      {formData.brand && (
                        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">{formData.brand}</p>
                      )}
                      <h3 className="font-display font-medium text-xl text-foreground line-clamp-1">
                        {formData.name || "Untitled Selection"}
                      </h3>
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-3">
                      <span className="text-lg font-display font-medium text-foreground">
                        ₹{formData.price || "0.00"}
                      </span>
                      {formData.originalPrice && formData.price && formData.originalPrice !== formData.price && (
                        <span className="text-sm line-through text-muted-foreground/40 font-body">₹{formData.originalPrice}</span>
                      )}
                    </div>

                    <div className="w-full h-px bg-border/20" />

                    {/* Category & Stats */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        {formData.category || "General"}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        Stock: {formData.stock || "0"}
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* Additional Specs in Preview */}
                <div className="space-y-4 pt-4 border-t border-border/10">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Editorial Summary</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-[#F9F8FA] border border-border/30">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Fabric</p>
                      <p className="text-[10px] font-medium text-foreground truncate">{formData.fabric || "N/A"}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F9F8FA] border border-border/30">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Fit</p>
                      <p className="text-[10px] font-medium text-foreground truncate">{formData.fit || "N/A"}</p>
                    </div>
                  </div>
                  {formData.descriptionPoints.length > 0 && (
                    <ul className="space-y-1.5">
                      {formData.descriptionPoints.slice(0, 3).map((pt, i) => (
                        <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-2">
                          <span className="w-1 h-1 rounded-full bg-primary shrink-0 mt-1" />
                          <span className="line-clamp-1">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
