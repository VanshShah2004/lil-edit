import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/layout/Navbar";
import RouteFallback from "@/components/RouteFallback";
import UserNavbar from "@/components/home/UserNavbar";
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
  const { sendSignupOtp, verifySignupOtpAndCompleteProfile, signInWithGoogle, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Preserve the guest flow's destination (?redirect=/checkout or /cart) through the OTP
  // steps, falling back to the homepage. Same-origin absolute paths only (no open redirect).
  const redirectParam = searchParams.get("redirect");
  const redirectTo =
    redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")
      ? redirectParam
      : "/";

  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, navigate, redirectTo]);

  // Show loading state
  if (authLoading) {
    return <RouteFallback />;
  }

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

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
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

      navigate(redirectTo, { replace: true });
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

  const handleGoogle = async () => {
    setError("");
    setSuccessMsg("");
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
    <div className="min-h-screen flex flex-col bg-[#E9DFF5]">
      {user ? <UserNavbar /> : <Navbar />}
      <main className="flex-1 flex items-center justify-center pb-[89px] sm:pb-16 px-4" style={{ paddingTop: 'calc(var(--navbar-height, 80px) + 2rem)' }}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8 sm:mb-3">
            <img src={logo} alt="The Lil Edit" className="h-28 sm:h-24 mx-auto mb-6 sm:mb-[9px] sm:-mt-[5px]" />
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
            <div className="space-y-5">
              <form className="space-y-4" onSubmit={handleSendOtp}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-body text-sm text-foreground mb-1.5">First Name</label>
                    <input
                      type="text"
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
                    placeholder="your@email.com"
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

              <div className="space-y-4">
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
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleVerifyOtp}>
              <div>
                <label className="block font-body text-sm text-foreground mb-1.5">OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
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