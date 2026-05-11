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
} from "lucide-react";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const COLORS = [
  { name: "Black", hex: "#1a1a1a" },
  { name: "White", hex: "#ffffff" },
  { name: "Beige", hex: "#d4c5b9" },
  { name: "Olive", hex: "#6b8e23" },
  { name: "Navy", hex: "#001f3f" },
  { name: "Grey", hex: "#808080" },
];

const CATEGORIES = [
  "Oversized T-Shirts",
  "Hoodies",
  "Jackets",
  "Cargo Pants",
  "Sneakers",
  "Accessories",
];

const GENDERS = ["Men", "Women", "Unisex"];

interface FormData {
  name: string;
  brand: string;
  description: string;
  category: string;
  gender: string;
  price: string;
  discountPrice: string;
  stock: string;
  sku: string;
  tags: string;
  selectedSizes: string[];
  selectedColors: string[];
  featured: boolean;
  newArrival: boolean;
  bestseller: boolean;
  publishImmediate: boolean;
}

const AddProduct = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    name: "",
    brand: "",
    description: "",
    category: "",
    gender: "",
    price: "",
    discountPrice: "",
    stock: "",
    sku: "",
    tags: "",
    selectedSizes: [],
    selectedColors: [],
    featured: false,
    newArrival: false,
    bestseller: false,
    publishImmediate: false,
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

  const toggleSize = (size: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedSizes: prev.selectedSizes.includes(size)
        ? prev.selectedSizes.filter((s) => s !== size)
        : [...prev.selectedSizes, size],
    }));
  };

  const toggleColor = (colorName: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedColors: prev.selectedColors.includes(colorName)
        ? prev.selectedColors.filter((c) => c !== colorName)
        : [...prev.selectedColors, colorName],
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
    if (!formData.price || !formData.discountPrice) return 0;
    const original = parseFloat(formData.price);
    const discounted = parseFloat(formData.discountPrice);
    return Math.round(((original - discounted) / original) * 100);
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
                        placeholder="e.g. Classic Oversized Trench"
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

                  <motion.div whileHover={{ scale: 1.005 }} className="group">
                    <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                      Editorial Description
                    </label>
                    <div className="relative">
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        placeholder="Narrate the product's story, craftsmanship, and silhouette..."
                        rows={6}
                        maxLength={500}
                        className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 resize-none font-body text-[15px] leading-relaxed"
                      />
                      <div className="absolute bottom-4 right-4 text-[10px] font-bold tracking-widest text-muted-foreground/40">
                        {formData.description.length} / 500
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Category & Gender */}
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
                        Original Price
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 font-body">₹</span>
                        <input
                          type="number"
                          name="price"
                          value={formData.price}
                          onChange={handleInputChange}
                          placeholder="0.00"
                          step="0.01"
                          className="w-full pl-8 pr-4 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                        />
                      </div>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.01 }} className="group">
                      <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                        Discounted Price
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 font-body">₹</span>
                        <input
                          type="number"
                          name="discountPrice"
                          value={formData.discountPrice}
                          onChange={handleInputChange}
                          placeholder="0.00"
                          step="0.01"
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
                          <p className="text-[10px] font-bold uppercase tracking-widest text-red-500/60 mb-0.5">Reduction</p>
                          <p className="text-xl font-display font-medium text-red-500">{discountPercent}%</p>
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

                  <motion.div whileHover={{ scale: 1.01 }} className="group">
                    <label className="block text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70 mb-2 transition-colors group-focus-within:text-primary">
                      Search Metadata
                    </label>
                    <input
                      type="text"
                      name="tags"
                      value={formData.tags}
                      onChange={handleInputChange}
                      placeholder="e.g. minimalist, neutral, organic (comma separated)"
                      className="w-full px-5 py-4 rounded-xl border border-border/50 bg-[#F9F8FA] focus:bg-white focus:border-primary/50 focus:ring-4 focus:ring-primary/5 outline-none transition-all duration-300 font-body text-[15px]"
                    />
                  </motion.div>
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

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                    {COLORS.map((color) => (
                      <motion.button
                        key={color.name}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleColor(color.name)}
                        className={`p-5 rounded-2xl border transition-all duration-300 text-left ${formData.selectedColors.includes(color.name)
                          ? "border-primary bg-primary/[0.02] shadow-xl shadow-primary/5"
                          : "border-border/50 bg-[#F9F8FA] hover:border-primary/20"
                          }`}
                      >
                        <div className="flex items-center gap-4 mb-3">
                          <div
                            className="w-8 h-8 rounded-full border border-border/20 shadow-inner"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span className="text-sm font-medium text-foreground tracking-tight">{color.name}</span>
                        </div>
                        {formData.selectedColors.includes(color.name) ? (
                          <motion.div
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-[10px] text-primary font-bold uppercase tracking-widest"
                          >
                            Selected
                          </motion.div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest">
                            Offered
                          </div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Images */}
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <h2 className="text-xl font-display font-medium text-foreground tracking-tight">Visual Assets</h2>
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
                      <p className="text-foreground font-display font-medium text-lg mb-2">Upload Product Imagery</p>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { key: "newArrival", label: "New Arrival", icon: Zap },
                      { key: "featured", label: "Featured Product", icon: Star },
                      { key: "bestseller", label: "Bestseller", icon: TrendingUp },
                      { key: "publishImmediate", label: "Live Immediately", icon: Eye },
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
                            animate={{
                              x: formData[key as keyof FormData] ? 24 : 0,
                            }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className="w-4 h-4 bg-white rounded-full shadow-sm"
                          />
                        </div>
                      </motion.button>
                    ))}
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
                    {isPublishing ? "Publishing..." : "Launch Listing"}
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
                        ₹{formData.discountPrice || formData.price || "0.00"}
                      </span>
                      {formData.discountPrice && formData.price && formData.price !== formData.discountPrice && (
                        <span className="text-sm line-through text-muted-foreground/40 font-body">₹{formData.price}</span>
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
