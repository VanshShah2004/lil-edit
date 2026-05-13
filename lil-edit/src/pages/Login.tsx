import { useState, useEffect } from 'react';
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import logo from "@/assets/logo.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { signIn, signInWithGoogle, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  // Show loading state
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Basic validation
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      setLoading(false);
      return;
    }

    try {
      await signIn(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
      // Redirect happens automatically; session will populate after callback.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {user ? <UserNavbar /> : <Navbar />}
      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={logo} alt="The Lil Edit" className="h-16 mx-auto mb-6" />
            <h1 className="font-display text-3xl text-foreground mb-2">Welcome back</h1>
            <p className="text-muted-foreground font-body text-sm">Log in to your account</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-body">{error}</p>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block font-body text-sm text-foreground mb-1.5">Email</label>
              <input
                type="email"
                placeholder="hello@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block font-body text-sm text-foreground mb-1.5">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
            </div>
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm font-body text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Button 
              type="submit" 
              disabled={loading}
              className="w-full font-body bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Logging in..." : "Log In"}
            </Button>
          </form>

          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-body">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={handleGoogle}
              className="w-full rounded-xl py-3 text-sm border border-border"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 48 48"
                className="mr-2"
                aria-hidden="true"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.66 1.22 9.14 3.22l6.77-6.77C35.79 2.27 30.2 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.9 6.14C12.28 13.52 17.67 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.1 24.5c0-1.57-.14-3.08-.4-4.5H24v8.51h12.4c-.54 2.9-2.19 5.36-4.67 7.02l7.18 5.57c4.2-3.87 6.59-9.57 6.59-16.6z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.46 28.64A14.5 14.5 0 0 1 9.5 24c0-1.62.28-3.19.96-4.64l-7.9-6.14A23.94 23.94 0 0 0 0 24c0 3.86.92 7.5 2.56 10.78l7.9-6.14z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.2 0 11.79-2.05 15.73-5.57l-7.18-5.57c-2 1.34-4.57 2.13-8.55 2.13-6.33 0-11.72-4.02-13.54-9.86l-7.9 6.14C6.51 42.62 14.62 48 24 48z"
                />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
              Continue with Google
            </Button>
          </div>

          <p className="text-center mt-6 font-body text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary hover:underline font-medium">Sign up</Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Login;