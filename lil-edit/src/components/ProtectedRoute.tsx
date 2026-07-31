import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import RouteFallback from "@/components/RouteFallback";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) return <RouteFallback />;
  if (!user) return <Navigate to="/" />;

  return <>{children}</>;
};