import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import { useAuth } from "@/contexts/AuthContext";
const AuthCallback = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Supabase reads the OAuth code from the URL and exchanges it for a session.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {user ? <UserNavbar /> : <Navbar />}
      <main className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Signing you in…</div>
      </main>
    </div>
  );
};

export default AuthCallback;

