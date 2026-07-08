import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
import Footer from "@/components/layout/Footer";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";

const ForgotPassword = () => {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const { user, sendPasswordResetOtp, verifyPasswordResetOtpAndUpdatePassword, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  // Show loading state
  if (authLoading) {
    return <RouteFallback />;
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    if (!email.trim()) {
      setError("Email is required");
      setLoading(false);
      return;
    }

    try {
      await sendPasswordResetOtp(email);
      setStep("otp");
      // Deliberately generic — we don't confirm whether this email has an account.
      setSuccessMsg(`If an account exists for ${email}, we've sent a reset code.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    if (!otp.trim()) {
      setError("OTP is required");
      setLoading(false);
      return;
    }

    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError("Please enter and confirm your new password");
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      await verifyPasswordResetOtpAndUpdatePassword({
        email: email.trim(),
        otp: otp.trim(),
        newPassword,
      });
      setSuccessMsg("Password updated successfully. Please log in.");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await sendPasswordResetOtp(email);
      setSuccessMsg(`If an account exists for ${email}, we've sent a reset code.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#E9DFF5]">
      {user ? <UserNavbar /> : <Navbar />}
      <main className="flex-1 flex items-center justify-center py-16 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={logo} alt="The Lil Edit" className="h-16 mx-auto mb-6" />
            <h1 className="font-display text-3xl text-foreground mb-2">
              {step === "email" ? "Forgot password" : "Reset your password"}
            </h1>
            <p className="text-muted-foreground font-body text-sm">
              {step === "email"
                ? "Enter your email to receive an OTP"
                : `Enter OTP sent to ${email} and choose a new password`}
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

          {step === "email" ? (
            <form className="space-y-4" onSubmit={handleSendOtp}>
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

              <Button
                type="submit"
                disabled={loading}
                className="w-full font-body bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Sending OTP..." : "Send OTP"}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleVerifyAndUpdate}>
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

              <div>
                <label className="block font-body text-sm text-foreground mb-1.5">New password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block font-body text-sm text-foreground mb-1.5">Confirm password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full font-body bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Updating..." : "Verify OTP & Update Password"}
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
                onClick={() => setStep("email")}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Change email
              </button>
            </form>
          )}

          <p className="text-center mt-6 font-body text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Back to login
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ForgotPassword;

