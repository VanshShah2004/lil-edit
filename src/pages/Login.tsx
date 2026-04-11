import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import logo from "@/assets/logo.png";

const Login = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1 flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logo} alt="The Lil Edit" className="h-16 mx-auto mb-6" />
          <h1 className="font-display text-3xl text-foreground mb-2">Welcome back</h1>
          <p className="text-muted-foreground font-body text-sm">Log in to your account</p>
        </div>
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="block font-body text-sm text-foreground mb-1.5">Email</label>
            <input
              type="email"
              placeholder="hello@example.com"
              className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block font-body text-sm text-foreground mb-1.5">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <Button type="submit" className="w-full font-body bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl py-3 text-sm">
            Log In
          </Button>
        </form>
        <p className="text-center mt-6 font-body text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary hover:underline font-medium">Sign up</Link>
        </p>
      </div>
    </main>
    <Footer />
  </div>
);

export default Login;
