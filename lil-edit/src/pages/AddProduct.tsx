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
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-background/90 pt-24 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto max-w-7xl">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <h1 className="text-5xl sm:text-6xl font-display font-light tracking-tight text-foreground mb-3">
            Add New Product
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Create and publish a new fashion listing for The Lil Edit collection
          </p>
          <div className="flex justify-center gap-8 mt-8">
            <div className="flex flex-col items-center">
              <div className="text-4xl font-display font-light">∞</div>
              <p className="text-xs text-muted-foreground mt-2">Unlimited Products</p>
            </div>
            <div className="w-px bg-border/30" />
            <div className="flex flex-col items-center">
              <Star className="w-8 h-8 text-amber-500" />
              <p className="text-xs text-muted-foreground mt-2">Premium Curation</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-2"
          >
            <div className="bg-background/80 backdrop-blur-sm rounded-2xl border border-border/50 shadow-lg hover:shadow-xl transition-shadow duration-300 p-8 space-y-8">
              {/* Basic Info */}
              <div className="space-y-6">
                <h2 className="text-2xl font-display font-light text-foreground">Basic Information</h2>
                <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <motion.div whileHover={{ scale: 1.01 }} className="group">
                    <label className="block text-sm font-medium text-foreground mb-2 group-focus-within:text-primary transition-colors">
                      Product Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="e.g., Oversized Cotton Tee"
                      className="w-full px-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-300"
                    />
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.01 }} className="group">
                    <label className="block text-sm font-medium text-foreground mb-2 group-focus-within:text-primary transition-colors">
                      Brand
                    </label>
                    <input
                      type="text"
                      name="brand"
                      value={formData.brand}
                      onChange={handleInputChange}
                      placeholder="e.g., Premium Basics"
                      className="w-full px-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-300"
                    />
                  </motion.div>
                </div>

                <motion.div whileHover={{ scale: 1.01 }} className="group">
                  <label className="block text-sm font-medium text-foreground mb-2 group-focus-within:text-primary transition-colors">
                    Description
                  </label>
                  <div className="relative">
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Describe the product, materials, fit, and style..."
                      rows={5}
                      maxLength={500}
                      className="w-full px-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-300 resize-none"
                    />
                    <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
                      {formData.description.length}/500
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Category & Gender */}
              <div className="space-y-6">
                <h2 className="text-2xl font-display font-light text-foreground">Classification</h2>
                <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <motion.div whileHover={{ scale: 1.01 }} className="group">
                    <label className="block text-sm font-medium text-foreground mb-2">Category</label>
                    <div className="relative">
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none appearance-none transition-all duration-300"
                      >
                        <option value="">Select a category</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                    </div>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.01 }} className="group">
                    <label className="block text-sm font-medium text-foreground mb-2">Gender Category</label>
                    <div className="relative">
                      <select
                        name="gender"
                        value={formData.gender}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none appearance-none transition-all duration-300"
                      >
                        <option value="">Select gender</option>
                        {GENDERS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-6">
                <h2 className="text-2xl font-display font-light text-foreground">Pricing</h2>
                <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <motion.div whileHover={{ scale: 1.01 }} className="group">
                    <label className="block text-sm font-medium text-foreground mb-2">Product Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <input
                        type="number"
                        name="price"
                        value={formData.price}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        step="0.01"
                        className="w-full pl-7 pr-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-300"
                      />
                    </div>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.01 }} className="group">
                    <label className="block text-sm font-medium text-foreground mb-2">Discount Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <input
                        type="number"
                        name="discountPrice"
                        value={formData.discountPrice}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        step="0.01"
                        className="w-full pl-7 pr-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-300"
                      />
                    </div>
                  </motion.div>

                  {discountPercent > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-end pb-3"
                    >
                      <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg w-full text-center">
                        <p className="text-xs text-muted-foreground">Discount</p>
                        <p className="text-2xl font-display font-light text-red-500">{discountPercent}%</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Inventory */}
              <div className="space-y-6">
                <h2 className="text-2xl font-display font-light text-foreground">Inventory</h2>
                <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <motion.div whileHover={{ scale: 1.01 }} className="group">
                    <label className="block text-sm font-medium text-foreground mb-2">Stock Quantity</label>
                    <input
                      type="number"
                      name="stock"
                      value={formData.stock}
                      onChange={handleInputChange}
                      placeholder="0"
                      min="0"
                      className="w-full px-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-300"
                    />
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.01 }} className="group">
                    <label className="block text-sm font-medium text-foreground mb-2">SKU Code</label>
                    <input
                      type="text"
                      name="sku"
                      value={formData.sku}
                      onChange={handleInputChange}
                      placeholder="e.g., SKU-001"
                      className="w-full px-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-300"
                    />
                  </motion.div>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-6">
                <h2 className="text-2xl font-display font-light text-foreground">Tags</h2>
                <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

                <motion.div whileHover={{ scale: 1.01 }} className="group">
                  <label className="block text-sm font-medium text-foreground mb-2">Product Tags</label>
                  <input
                    type="text"
                    name="tags"
                    value={formData.tags}
                    onChange={handleInputChange}
                    placeholder="e.g., summer, casual, sustainable (comma separated)"
                    className="w-full px-4 py-3 rounded-lg border border-border/60 bg-background focus:bg-background focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-300"
                  />
                </motion.div>
              </div>

              {/* Sizes */}
              <div className="space-y-6">
                <h2 className="text-2xl font-display font-light text-foreground">Sizes</h2>
                <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

                <div className="flex flex-wrap gap-3">
                  {SIZES.map((size) => (
                    <motion.button
                      key={size}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleSize(size)}
                      className={`px-4 py-2.5 rounded-full font-medium text-sm transition-all duration-300 border-2 ${
                        formData.selectedSizes.includes(size)
                          ? "border-primary bg-primary text-primary-foreground shadow-md"
                          : "border-border/60 bg-background text-foreground hover:border-primary/50"
                      }`}
                    >
                      {size}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Colors */}
              <div className="space-y-6">
                <h2 className="text-2xl font-display font-light text-foreground">Colors</h2>
                <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {COLORS.map((color) => (
                    <motion.button
                      key={color.name}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleColor(color.name)}
                      className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                        formData.selectedColors.includes(color.name)
                          ? "border-primary shadow-lg"
                          : "border-border/60 hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-6 h-6 rounded-full border border-border/30"
                          style={{ backgroundColor: color.hex }}
                        />
                        <span className="text-sm font-medium text-foreground">{color.name}</span>
                      </div>
                      {formData.selectedColors.includes(color.name) && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-xs text-primary font-semibold"
                        >
                          ✓ Selected
                        </motion.div>
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Images */}
              <div className="space-y-6">
                <h2 className="text-2xl font-display font-light text-foreground">Product Images</h2>
                <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

                <motion.div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  whileHover={{ scale: 1.01 }}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border/40 hover:border-primary/30 bg-background/30"
                  }`}
                >
                  <motion.div
                    animate={{ y: isDragging ? -5 : 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-foreground font-medium mb-1">Drag & drop images here</p>
                    <p className="text-sm text-muted-foreground mb-4">or click to select files</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                    >
                      Select Images
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
                    className="grid grid-cols-2 sm:grid-cols-3 gap-4"
                  >
                    {imagePreviews.map((preview, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative group rounded-lg overflow-hidden bg-secondary"
                      >
                        <img
                          src={preview}
                          alt={`Preview ${index}`}
                          className="w-full h-40 object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => removeImage(index)}
                          className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </motion.button>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* Status & Publishing */}
              <div className="space-y-6">
                <h2 className="text-2xl font-display font-light text-foreground">Status & Publishing</h2>
                <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

                <div className="space-y-4">
                  {[
                    { key: "newArrival", label: "New Arrival", icon: Zap },
                    { key: "featured", label: "Featured Product", icon: Star },
                    { key: "bestseller", label: "Bestseller", icon: TrendingUp },
                  ].map(({ key, label, icon: Icon }) => (
                    <motion.button
                      key={key}
                      whileHover={{ x: 4 }}
                      onClick={() => handleToggle(key as keyof FormData)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all duration-300 ${
                        formData[key as keyof FormData]
                          ? "border-primary bg-primary/5"
                          : "border-border/60 bg-background hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                        <span className="font-medium text-foreground">{label}</span>
                      </div>
                      <div
                        className={`w-10 h-6 rounded-full transition-all duration-300 ${
                          formData[key as keyof FormData] ? "bg-primary" : "bg-border/40"
                        }`}
                      >
                        <motion.div
                          animate={{
                            x: formData[key as keyof FormData] ? 20 : 2,
                          }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className="w-5 h-5 bg-white rounded-full mt-0.5"
                        />
                      </div>
                    </motion.button>
                  ))}

                  <motion.button
                    whileHover={{ x: 4 }}
                    onClick={() => handleToggle("publishImmediate")}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all duration-300 mt-4 pt-4 border-t-2 ${
                      formData.publishImmediate
                        ? "border-green-500/50 bg-green-500/5"
                        : "border-border/60 bg-background hover:border-green-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {formData.publishImmediate ? (
                        <Eye className="w-5 h-5 text-green-500" />
                      ) : (
                        <EyeOff className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="font-medium text-foreground">Publish Immediately</span>
                    </div>
                    <div
                      className={`w-10 h-6 rounded-full transition-all duration-300 ${
                        formData.publishImmediate ? "bg-green-500" : "bg-border/40"
                      }`}
                    >
                      <motion.div
                        animate={{
                          x: formData.publishImmediate ? 20 : 2,
                        }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        className="w-5 h-5 bg-white rounded-full mt-0.5"
                      />
                    </div>
                  </motion.button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-6 border-t border-border/30">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border/60 text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  {isSaving ? "Saving..." : "Save Draft"}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isPublishing ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                  {isPublishing ? "Publishing..." : "Publish Product"}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Live Preview Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:sticky lg:top-28 h-fit"
          >
            <div className="bg-background/80 backdrop-blur-sm rounded-2xl border border-border/50 shadow-lg p-6 space-y-6">
              <h2 className="text-xl font-display font-light text-foreground">Live Preview</h2>
              <div className="h-px bg-gradient-to-r from-border via-border/30 to-transparent" />

              {/* Product Card Preview */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg overflow-hidden border border-border/30 bg-secondary/30 hover:shadow-lg transition-shadow duration-300"
              >
                {/* Image Preview */}
                {imagePreviews.length > 0 ? (
                  <div className="relative w-full aspect-square bg-secondary overflow-hidden group">
                    <img
                      src={imagePreviews[0]}
                      alt="Product preview"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                    {discountPercent > 0 && (
                      <div className="absolute top-3 right-3 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">
                        -{discountPercent}%
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full aspect-square bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center">
                    <div className="text-center">
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No images yet</p>
                    </div>
                  </div>
                )}

                {/* Product Info */}
                <div className="p-4 space-y-3">
                  {formData.brand && (
                    <p className="text-xs font-medium text-primary/70 uppercase tracking-wide">{formData.brand}</p>
                  )}
                  <h3 className="font-display font-light text-lg text-foreground line-clamp-2">
                    {formData.name || "Product Name"}
                  </h3>

                  {/* Colors Preview */}
                  {formData.selectedColors.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {formData.selectedColors.map((color) => {
                        const colorHex = COLORS.find((c) => c.name === color)?.hex;
                        return (
                          <div
                            key={color}
                            className="w-5 h-5 rounded-full border border-border/30"
                            style={{ backgroundColor: colorHex }}
                            title={color}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Sizes Preview */}
                  {formData.selectedSizes.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Sizes: {formData.selectedSizes.join(", ")}
                    </div>
                  )}

                  {/* Price */}
                  <div className="space-y-1 pt-2">
                    {formData.price && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-display font-light text-foreground">
                          ${formData.discountPrice || formData.price}
                        </span>
                        {formData.discountPrice && formData.price !== formData.discountPrice && (
                          <span className="text-sm line-through text-muted-foreground">${formData.price}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Category */}
                  {formData.category && (
                    <div className="text-xs text-muted-foreground pt-1">{formData.category}</div>
                  )}

                  {/* Status Badges */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {formData.newArrival && (
                      <span className="text-xs px-2 py-1 bg-blue-500/10 text-blue-600 rounded-full border border-blue-500/20">
                        New
                      </span>
                    )}
                    {formData.featured && (
                      <span className="text-xs px-2 py-1 bg-amber-500/10 text-amber-600 rounded-full border border-amber-500/20">
                        Featured
                      </span>
                    )}
                    {formData.bestseller && (
                      <span className="text-xs px-2 py-1 bg-green-500/10 text-green-600 rounded-full border border-green-500/20">
                        Bestseller
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Product Stats */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Product Stats</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-secondary/50 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Stock</p>
                    <p className="text-lg font-display font-light">{formData.stock || "0"}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Images</p>
                    <p className="text-lg font-display font-light">{imagePreviews.length}</p>
                  </div>
                </div>
              </div>

              {/* Visibility Status */}
              <div className="p-3 rounded-lg border border-border/30 bg-secondary/20">
                <p className="text-xs font-medium text-foreground mb-1">Visibility</p>
                <p className="text-sm text-muted-foreground">
                  {formData.publishImmediate ? (
                    <span className="text-green-600 font-medium">✓ Will publish on save</span>
                  ) : (
                    <span>Draft only</span>
                  )}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default AddProduct;
