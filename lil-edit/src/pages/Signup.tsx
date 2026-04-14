import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import logo from "@/assets/logo.png";

const Signup = () => {
  const [step, setStep] = useState<"details" | "otp">("details");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const { sendSignupOtp, verifySignupOtpAndCompleteProfile, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/home", { replace: true });
    }
  }, [user, navigate]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    try {
      await sendSignupOtp(email);
      setStep("otp");
      setSuccessMsg(`OTP sent to ${email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    if (!otp.trim()) {
      setError("Please enter OTP");
      setLoading(false);
      return;
    }

    try {
      await verifySignupOtpAndCompleteProfile({
        email,
        otp: otp.trim(),
        password,
        first_name: firstName,
        last_name: lastName,
      });

      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      await sendSignupOtp(email);
      setSuccessMsg(`OTP resent to ${email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={logo} alt="The Lil Edit" className="h-16 mx-auto mb-6" />
            <h1 className="font-display text-3xl text-foreground mb-2">
              {step === "details" ? "Create an account" : "Verify your email"}
            </h1>
            <p className="text-muted-foreground font-body text-sm">
              {step === "details"
                ? "Join The Lil Edit family"
                : `Enter OTP sent to ${email}`}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-body">{error}</p>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700 font-body">{successMsg}</p>
            </div>
          )}

          {step === "details" ? (
            <form className="space-y-4" onSubmit={handleSendOtp}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">First Name</label>
                  <input
                    type="text"
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Last Name</label>
                  <input
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  />
                </div>
              </div>

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

              <Button
                type="submit"
                disabled={loading}
                className="w-full font-body bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending OTP..." : "Send OTP"}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleVerifyOtp}>
              <div>
                <label className="block font-body text-sm text-foreground mb-1.5">OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Enter 8-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full font-body bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Verifying..." : "Verify OTP & Create Account"}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={handleResendOtp}
                className="w-full rounded-xl"
              >
                Resend OTP
              </Button>

              <button
                type="button"
                disabled={loading}
                onClick={() => setStep("details")}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Change email/details
              </button>
            </form>
          )}

          <p className="text-center mt-6 font-body text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Log in
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Signup;