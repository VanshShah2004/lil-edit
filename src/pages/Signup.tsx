import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import logo from "@/assets/logo.png";

const Signup = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1 flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logo} alt="The Lil Edit" className="h-16 mx-auto mb-6" />
          <h1 className="font-display text-3xl text-foreground mb-2">Create an account</h1>
          <p className="text-muted-foreground font-body text-sm">Join The Lil Edit family</p>
        </div>
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-sm text-foreground mb-1.5">First Name</label>
              <input
                type="text"
                placeholder="Jane"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block font-body text-sm text-foreground mb-1.5">Last Name</label>
              <input
                type="text"
                placeholder="Doe"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
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
            Sign Up
          </Button>
        </form>
        <p className="text-center mt-6 font-body text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline font-medium">Log in</Link>
        </p>
      </div>
    </main>
    <Footer />
  </div>
);

export default Signup;
