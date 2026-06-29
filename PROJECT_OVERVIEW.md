# 🎨 **THE NEW-ECOMM PROJECT: A Comprehensive Deep Dive**

*A vivid exploration of a full-stack e-commerce platform for "Lil Edit" — a curated fashion marketplace for kids*

---

## 📖 **EXECUTIVE SUMMARY**

**new-ecomm** is an ambitious, production-ready e-commerce platform built with modern web technologies. At its core, it's a split-stack system: a **React + TypeScript frontend** (codenamed "lil-edit") paired with a **Node.js/Express backend**, both communicating through a cloud-native **Supabase** database ecosystem. The project specializes in selling curated kids' ethnic wear, party dresses, casual clothing, and accessories — think boutique fashion for children with an editorial approach.

The platform isn't just another shopping cart; it's a **content-driven marketplace** with sophisticated product management, inventory tracking, user authentication, a complete Razorpay checkout flow, verified customer reviews, and a sleek, component-rich user interface built with Radix UI primitives.

---

## 🏗️ **PROJECT ARCHITECTURE AT A GLANCE**

```text
new-ecomm/
├── backend/                    # Express.js API server (TypeScript)
│   ├── server.ts              # Express app setup, routing hub
│   ├── routes/                # API endpoints for auth, products, sku, checkout
│   ├── lib/                   # Core business logic (DB, persistence, mapping)
│   ├── services/              # Domain-specific logic (SKU generation)
│   ├── utils/                 # Utilities (SKU formatting, category codes)
│   └── package.json           # Backend deps: Express, Supabase, Nodemailer, Razorpay
│
├── lil-edit/                  # React frontend (TypeScript + Vite)
│   ├── src/
│   │   ├── App.tsx           # Router hub, auth providers
│   │   ├── pages/            # Distinct route pages (Home, Login, AddProduct, Checkout, etc.)
│   │   ├── components/       # UI components (Radix UI, Reviews, Checkout)
│   │   ├── contexts/         # AuthContext for global auth state
│   │   ├── lib/              # Supabase client, checkoutApi, reviewsApi, pricing
│   │   ├── types/            # TypeScript interfaces
│   │   ├── utils/            # SKU generation, slug formatting
│   │   ├── hooks/            # Custom hooks
│   │   └── assets/           # Static assets
│   ├── supabase/             # SQL migrations for Supabase
│   ├── public/               # Static assets
│   ├── vite.config.ts        # Vite bundler config
│   ├── tailwind.config.cjs   # Tailwind CSS design system
│   └── package.json          # Frontend deps
│
└── supabase/                 # Shared Supabase migrations
    └── migrations/           # SKU counters, product catalog, orders, reviews
```

---

## 🔐 **TECHNOLOGY STACK**

### **Frontend (lil-edit/)**
- **Framework**: React 18+ with TypeScript 6.x
- **Build Tool**: Vite (for blazing-fast dev server)
- **Styling**: Tailwind CSS 3.x + Tailwind UI components
- **Component Library**: Radix UI (accessible UI primitives)
- **State Management**: React Context API (auth), TanStack React Query v5 (server state)
- **Routing**: React Router v6 (SPA)
- **HTTP Client**: Fetch API
- **Auth**: Supabase Auth + Firebase Auth
- **Database ORM**: @supabase/supabase-js
- **Animations**: Framer Motion
- **UI Icons**: Lucide React, React Icons
- **Toast/Notifications**: Sonner + custom Toaster
- **Date Utilities**: date-fns
- **Form Handling**: CMDk, Input OTP

### **Backend (backend/)**
- **Runtime**: Node.js 18+
- **Framework**: Express.js v5.2 (RESTful API)
- **Language**: TypeScript 6.x
- **Dev Tools**: tsx, nodemon, ts-node
- **Database**: Supabase PostgreSQL
- **Payments**: Razorpay Node SDK
- **Email**: Gmail SMTP via Nodemailer
- **CORS**: Enabled for localhost dev servers
- **Body Parsing**: 50MB JSON limit

### **Database (Supabase/PostgreSQL)**
- **User Auth**: Built-in Supabase Auth
- **Product Catalog**: Dual-schema (published & draft products)
- **Inventory**: Variant-based stock tracking
- **Orders**: Immutable order snapshots with Razorpay transaction linkage
- **Reviews**: RLS-protected product reviews with verification triggers
- **SKU System**: Atomic counter table with RPC triggers

---

## 📋 **DATABASE SCHEMA: THE HEARTBEAT**

### **Published Product Tables**
```text
products
├── id (UUID, PK)
├── title, brand, slug (unique)
├── base_sku, category, category_slug, gender
├── price, original_price
├── description_points, sizes, tags, badges
├── status, created_by, timestamps

product_variants
├── id, product_id
├── color_name, color_hex, variant_sku
├── stock, is_unlimited
├── sort_order, timestamps

product_images
├── id, product_id, variant_id
├── image_url, is_primary, is_campaign
```

### **Orders & Checkout Tables**
```text
orders
├── id (UUID, PK)
├── order_number (e.g., LE000123)
├── user_id, status, payment_status, payment_method
├── transaction_id (Razorpay Payment ID, unique)
├── subtotal, discount, shipping_fee, total
├── shipping_address (JSONB snapshot)

order_items
├── id, order_id, product_id
├── product_slug, sku, size, title, quantity
├── unit_price, original_price, line_total
```

### **Reviews System**
```text
product_reviews
├── id (UUID, PK)
├── product_slug, user_id (unique together)
├── rating, title, comment
├── images (TEXT[])
├── verified (Boolean, trigger-protected)
```

---

## 🔐 **AUTHENTICATION ARCHITECTURE**
The project implements a **hybrid authentication system** primarily using Supabase Email OTP along with password auth and Google OAuth. The global `AuthContext.tsx` wraps the application, managing protected routing layers (`<ProtectedRoute>`, `<AdminRoute>`).

---

## 🛍️ **PRODUCT CATALOG & SHOPPING FLOW**

### **Product Lifecycle**
Products follow a **draft → published** workflow allowing editors to work safely. 
**SKU Generation** follows a hierarchical, atomic format (`EDIT-{CATEGORY}-{GENDER}-{SEQUENTIAL_NUMBER}`) powered by a Supabase RPC, ensuring unique inventory items.

### **Checkout & Order Placement**
The platform implements a **verify-then-create** Razorpay prepaid checkout:
1. **Modes**: Supports both **Cart** checkout and direct **Buy Now** checkout.
2. **Initiate**: Backend validates stock, applies first-order discounts (`FIRST10`), and creates a Razorpay order, caching the priced snapshot in Redis.
3. **Verify**: Upon successful payment, backend verifies HMAC signature, locks the user's rows via `pg_advisory_xact_lock`, atomically decrements inventory, and places the final order via `place_order` RPC.

### **Review System**
A dual-review experience exists on the Order Detail page:
1. **Inline / Sidebar Reviews**: Customers can review items they purchased, complete with image uploads (up to 3 images, stored in Supabase public bucket).
2. **Verified Badge**: Backend fire-and-forget logic automatically marks reviews as `verified=true` once a user purchases the corresponding product.

---

## 📡 **API ENDPOINTS**

### **Products (Optimized for Performance)**
- `GET /api/products/detail?slug=...` — **CRITICAL PATH**. Fetches core product data only for instant PDP rendering.
- `GET /api/products/recommendations?slug=...` — **BACKGROUND**. Lazy-loaded via `requestIdleCallback` to fetch category and padding recommendations without blocking the PDP.
- `GET/POST /api/products/` — Catalog CRUD operations.

### **Checkout & Payments**
- `POST /api/checkout/initiate` — Pre-checks stock, computes totals, creates Razorpay order.
- `POST /api/checkout/verify` — Verifies payment, creates order, clears cart.
- `POST /api/checkout/webhook` — Razorpay webhook fallback for async capture.
- `GET /api/checkout/coupon` — Validates discount codes.

### **SKU Management**
- `GET /api/sku/generate` — Auto-generate next SKU.

### **Reviews (Supabase Client/RLS)**
- Frontend directly uses Supabase client (`reviewsApi.ts`) for CRUD on reviews, protected securely by Row Level Security (RLS).

---

## 🔄 **DATA FLOW DIAGRAMS**

### **PDP Fetch Flow (Non-blocking)**
```text
User navigates to PDP
  ↓
GET /api/products/detail (CRITICAL PATH - FAST)
  └─ Fetch Product only (fast DB query)
  ↓
Return product immediately → Instant Render with skeleton for recommendations
  ↓
requestIdleCallback() triggers
  ↓
GET /api/products/recommendations (BACKGROUND)
  └─ Fetch category & padding recommendations
  ↓
Replace skeleton with actual recommendations
```

### **Checkout Flow**
```text
User clicks Secure Checkout
  ↓
POST /api/checkout/initiate
  └─ Backend pre-checks stock, prices order, caches snapshot to Redis
  ↓
Frontend opens Razorpay Modal
  ↓
User pays successfully
  ↓
POST /api/checkout/verify
  └─ Backend verifies HMAC signature
  └─ Calls place_order() RPC
       ├─ Locks user rows (advisory lock)
       ├─ Decrements variant stock
       ├─ Inserts to orders & order_items
  └─ Clears Cart
  ↓
Redirect to Order Detail Success Page
```

---

## 🎯 **KEY FEATURES & FUNCTIONALITY**

### **Product Management**
- ✅ Color Variants, Inventory Tracking, Global/Variant Images
- ✅ Metadata (Tags, badges) & Draft/Publish CMS Workflow

### **Shopping & Checkout**
- ✅ **Shopping Cart**: Real-time pricing, synchronized with backend.
- ✅ **Secure Checkout**: Razorpay online integration.
- ✅ **Order Management**: Immutable order history, transactional state management.
- ✅ **Review System**: Authenticated reviews, image uploads, verified purchase badges.
- ✅ **Discount System**: Server-validated first-order discounts (`FIRST10`).

### **Performance**
- ✅ **Non-blocking PDP**: Instant page loads with lazy-loaded recommendations.
- ✅ **Code Splitting**: Vite lazy-loads pages.
- ✅ **Caching**: Segregated product and recommendation caches (5m TTL).
- ✅ **Query Optimization**: React Query deduplication, early LIMIT filtering in PostgreSQL.

---

## 📊 **CURRENT STATE & MATURITY**

### **Production Ready**
- ✅ Authentication system (OTP + password)
- ✅ Product catalog CRUD & Inventory management
- ✅ Customer Shopping Cart & Buy Now functionality
- ✅ Checkout & Payment Processing (Razorpay)
- ✅ Order Placement & Management
- ✅ Customer Review System with Image Uploads
- ✅ High-Performance Product Detail Pages (PDP)

### **In Progress / Future Enhancements**
- 🔨 Wishlist functionality
- 🔨 Advanced Search & Filtering
- 🔨 Email notifications wiring (Nodemailer hook stubbed, needs Resend/SendGrid integration)
- 🔨 Review moderation dashboard

---

## 🚀 **DEPLOYMENT CHECKLIST**

### **Frontend**
- [ ] Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RAZORPAY_KEY_ID`
- [ ] Set `VITE_API_URL` to production backend

### **Backend**
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- [ ] Deploy Node.js app

### **Database & Storage**
- [ ] Run all SQL migrations
- [ ] Create `review-images` PUBLIC bucket in Supabase Storage and apply RLS policies.

---

## 🏁 **CONCLUSION**

**new-ecomm** (Lil Edit) is a mature, high-performance e-commerce platform. Recent architectural updates have transformed the checkout process into a robust, transactional engine and significantly optimized page load speeds by separating critical path rendering from background tasks. The implementation of user reviews and dynamic checkout modes showcases its readiness as a scalable, real-world application.

**Project Status**: 🟢 **Production Ready**  
**Last Updated**: June 29, 2026  
**Team**: Vansh & Contributors  
**License**: ISC
