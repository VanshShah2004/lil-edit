import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const AuthCallback = () => {
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Signing you in…</div>
    </div>
  );
};

export default AuthCallback;

