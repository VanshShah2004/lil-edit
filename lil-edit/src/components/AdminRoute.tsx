import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, profile, loading, profileLoaded } = useAuth();

  // Wait for both the auth session AND (when signed in) the profile fetch to
  // settle. `loading` only covers the session, and the profile loads in the
  // background, so deciding on `profile?.role` before it resolves would bounce a
  // real admin to /dashboard on a hard refresh / direct navigation.
  if (loading || (user && !profileLoaded)) {
    console.log(`[AdminRoute] WAIT — loading=${loading}  user=${!!user}  profileLoaded=${profileLoaded}`);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log("[AdminRoute] DENY — not logged in → redirect /");
    return <Navigate to="/" />;
  }

  const isAdmin = profile?.role === "admin";
  if (!isAdmin) {
    console.log(`[AdminRoute] DENY — role=${profile?.role ?? "none"} (need admin) → redirect /dashboard`);
    return <Navigate to="/dashboard" />;
  }

  console.log(`[AdminRoute] ALLOW — admin access granted  role=${profile?.role}`);
  return <>{children}</>;
};

export default AdminRoute;
