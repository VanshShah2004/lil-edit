import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { MaintenanceProvider } from "@/contexts/MaintenanceContext";
import { CartProvider } from "@/contexts/CartContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { installSessionGuard } from "@/lib/sessionGuard";

// Before anything renders, so the very first authenticated call a page makes is
// already covered: a revoked-server-side session signs out and redirects to login
// instead of surfacing as a page full of "couldn't load" panels.
installSessionGuard();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <AuthProvider>
      <MaintenanceProvider>
        <CartProvider>
          <WishlistProvider>
            <App />
          </WishlistProvider>
        </CartProvider>
      </MaintenanceProvider>
    </AuthProvider>
  </ThemeProvider>,
);