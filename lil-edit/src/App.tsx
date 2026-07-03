import { lazy, Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Loader } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import AdminRoute from "./components/AdminRoute";
import PageTitle from "./components/PageTitle";
import MaintenanceGate from "./components/MaintenanceGate";
import TrackingBridge from "./components/TrackingBridge";

// Home is the landing route (/ and /dashboard) — keep it eager so the first
// paint never waits on a chunk fetch. Every other page is split into its own
// chunk and fetched on demand when the user navigates to that route.
import Home from "./pages/Home";

// lazyWithLog wraps React.lazy so each split chunk logs when it is fetched and
// how long the fetch took. The first time you visit a route you'll see
// "fetched in Xms" (real network/disk load); on later visits the dynamic
// import resolves from the module cache and logs "~0ms (cached)". This is the
// visible proof that code splitting is live — watch the browser console (F12)
// as you navigate. A route whose chunk never appears in the log was never
// downloaded, which is the whole point of splitting it out.
function lazyWithLog<T extends { default: ComponentType<unknown> }>(
  name: string,
  importFn: () => Promise<T>,
) {
  return lazy(() => {
    const start = performance.now();
    console.log(`[CODE-SPLIT] ⏳ fetching chunk: ${name}`);
    return importFn().then((mod) => {
      const ms = (performance.now() - start).toFixed(1);
      console.log(`[CODE-SPLIT] ✅ loaded chunk: ${name} — fetched in ${ms}ms`);
      return mod;
    });
  });
}

const Login          = lazyWithLog("Login",          () => import("./pages/Login"));
const Signup         = lazyWithLog("Signup",         () => import("./pages/Signup"));
const NotFound       = lazyWithLog("NotFound",        () => import("./pages/NotFound"));
const About          = lazyWithLog("About",           () => import("./pages/About"));
const ForgotPassword = lazyWithLog("ForgotPassword",  () => import("./pages/ForgotPassword"));
const AuthCallback   = lazyWithLog("AuthCallback",    () => import("./pages/AuthCallback"));
const ProductDetail  = lazyWithLog("ProductDetail",   () => import("./pages/ProductDetail"));
const Profile        = lazyWithLog("Profile",         () => import("./pages/Profile"));
const Cart           = lazyWithLog("Cart",            () => import("./pages/Cart"));
const Wishlist       = lazyWithLog("Wishlist",        () => import("./pages/Wishlist"));
const Collections    = lazyWithLog("Collections",     () => import("./pages/Collections"));
const SearchResults  = lazyWithLog("SearchResults",   () => import("./pages/SearchResults"));
const Orders         = lazyWithLog("Orders",          () => import("./pages/Orders"));
const AllOrders      = lazyWithLog("AllOrders",       () => import("./pages/AllOrders"));
const OrderDetail    = lazyWithLog("OrderDetail",     () => import("./pages/OrderDetail"));
const MyReviews      = lazyWithLog("MyReviews",        () => import("./pages/MyReviews"));
const Checkout       = lazyWithLog("Checkout",        () => import("./pages/Checkout"));

// Admin pages pull in heavy deps (charts, upload tooling) that normal shoppers
// never need — splitting them keeps that weight off the customer-facing bundle.
// These chunks should NEVER appear in the console for a normal shopper session.
const AddProduct       = lazyWithLog("AddProduct",       () => import("./pages/AddProduct"));
const EditProduct      = lazyWithLog("EditProduct",      () => import("./pages/EditProduct"));
const ManageProducts   = lazyWithLog("ManageProducts",   () => import("./pages/ManageProducts"));
const AdminOrders      = lazyWithLog("AdminOrders",      () => import("./pages/admin/Orders"));
const AdminOrderDetail = lazyWithLog("AdminOrderDetail", () => import("./pages/admin/OrderDetail"));
const AdminActivity    = lazyWithLog("AdminActivity",    () => import("./pages/admin/Activity"));
const AdminAuditLog    = lazyWithLog("AdminAuditLog",    () => import("./pages/admin/AuditLog"));
const AdminSpotlight   = lazyWithLog("AdminSpotlight",   () => import("./pages/admin/Spotlight"));
const AdminSettings    = lazyWithLog("AdminSettings",    () => import("./pages/admin/AdminSettings"));
const AdminGeneralSettings = lazyWithLog("AdminGeneralSettings", () => import("./pages/admin/GeneralSettings"));
const AdminSpotlightPreview = lazyWithLog("AdminSpotlightPreview", () => import("./pages/admin/SpotlightPreview"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader className="h-6 w-6 animate-spin text-gray-900" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PageTitle />
        <TrackingBridge />
        <MaintenanceGate>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/collections/:category/product/:productPath/*" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/search" element={<SearchResults />} />
            <Route path="/about" element={<About />} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/orders/all" element={<ProtectedRoute><AllOrders /></ProtectedRoute>} />
            <Route path="/orders/:orderId" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
            <Route path="/reviews" element={<ProtectedRoute><MyReviews /></ProtectedRoute>} />
            <Route path="/admin/add-product" element={<AdminRoute><AddProduct /></AdminRoute>} />
            <Route path="/admin/edit/:productId" element={<AdminRoute><EditProduct /></AdminRoute>} />
            <Route path="/admin/manage-products" element={<AdminRoute><ManageProducts /></AdminRoute>} />
            <Route path="/admin/orders" element={<AdminRoute><AdminOrders /></AdminRoute>} />
            <Route path="/admin/orders/:orderId" element={<AdminRoute><AdminOrderDetail /></AdminRoute>} />
            <Route path="/admin/activity" element={<AdminRoute><AdminActivity /></AdminRoute>} />
            <Route path="/admin/audit-log" element={<AdminRoute><AdminAuditLog /></AdminRoute>} />
            <Route path="/admin/spotlight" element={<AdminRoute><AdminSpotlight /></AdminRoute>} />
            <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
            <Route path="/admin/general-settings" element={<AdminRoute><AdminGeneralSettings /></AdminRoute>} />
            {/* Loaded inside The Spotlight's preview iframe — not user-navigable UI. */}
            <Route path="/admin/spotlight/preview" element={<AdminRoute><AdminSpotlightPreview /></AdminRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </MaintenanceGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
