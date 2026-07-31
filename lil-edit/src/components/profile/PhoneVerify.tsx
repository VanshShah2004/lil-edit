import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Mock OTP — any number "verifies" with the code below. Swapping in a real provider
// (Twilio / MSG91 / Supabase phone auth) is a self-contained change to handleSendOtp +
// handleVerifyOtp; the rest of this component and its consumers stay the same.
const MOCK_OTP = "123456";

interface PhoneVerifyProps {
  /** The full phone (country code + 10 digits) currently persisted on the profile, if any. */
  savedPhone: string;
  /** Fired after a successful verify + DB persist, with the new full phone. */
  onVerified?: (fullPhone: string) => void;
  /** Tighter spacing + hidden label, for the checkout card. */
  compact?: boolean;
  /** Field label; pass null to hide it (e.g. when the parent supplies its own heading). */
  label?: string | null;
}

const parsePhone = (full: string): { code: string; number: string } => {
  const match = full.match(/^(\+\d{1,4})(\d{10})$/);
  if (match) return { code: match[1], number: match[2] };
  return { code: "+91", number: full };
};

export default function PhoneVerify({ savedPhone, onVerified, compact = false, label = "Phone Number" }: PhoneVerifyProps) {
  const { user, profile, refreshProfile } = useAuth();

  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  // Full phone currently persisted — seeded from the prop, updated after a verify so the
  // "Verify" button correctly disables once the shown number matches what's saved.
  const [savedFull, setSavedFull] = useState("");
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [otp, setOtp] = useState("");
  const [mockOtpSent, setMockOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");

  // Sync from the persisted phone whenever it changes (mount + external updates).
  useEffect(() => {
    setSavedFull(savedPhone || "");
    if (savedPhone) {
      const { code, number } = parsePhone(savedPhone);
      setCountryCode(code);
      setPhoneNumber(number);
    }
  }, [savedPhone]);

  const resetVerification = () => {
    setIsPhoneVerified(false);
    setMockOtpSent(false);
    setOtp("");
    setOtpError("");
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
    resetVerification();
  };

  const handleCountryCodeChange = (value: string) => {
    setCountryCode(value);
    resetVerification();
  };

  const handleSendOtp = async () => {
    if (phoneNumber.length !== 10) {
      toast.error("Phone number must be 10 digits");
      return;
    }

    try {
      setIsSendingOtp(true);

      // Simulate network request
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setMockOtpSent(true);
      setOtp(""); // Clear any existing OTP
      toast.success("Mock OTP sent! (Use 123456 to verify)");
    } catch {
      toast.error("Failed to send OTP");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || !mockOtpSent) return;
    if (!user) {
      toast.error("Please log in to continue");
      return;
    }

    try {
      setIsVerifyingOtp(true);
      setOtpError("");

      // Simulate network verification
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (otp !== MOCK_OTP) {
        setOtpError("OTP does not match ❌");
        toast.error("Invalid OTP");
        return;
      }

      // Verified — persist the new number immediately.
      const fullPhone = `${countryCode}${phoneNumber}`;
      const { error } = await supabase
        .from("profiles")
        .update({ phone_number: fullPhone, is_phone_number_verified: true })
        .eq("id", user.id);
      if (error) {
        console.error("[PhoneVerify] persist failed:", error);
        setOtpError("Verified, but saving failed. Please try again.");
        toast.error(error.message || "Failed to save changes");
        return;
      }

      setSavedFull(fullPhone);
      setIsPhoneVerified(true);
      setMockOtpSent(false);
      toast.success("Phone verified & saved ✅");
      onVerified?.(fullPhone);
      // Keep the shared auth profile in sync so other pages (e.g. checkout gate) see it.
      void refreshProfile();
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const fullPhone = `${countryCode}${phoneNumber}`;
  const isDirty = fullPhone !== savedFull;
  // The number on screen counts as verified only when it matches the persisted one AND that
  // number is actually verified — in this session (isPhoneVerified) or per the profile row.
  // Keying off isDirty alone would wrongly lock out a saved-but-never-verified number: the
  // Verify button must stay available for it, or checkout's server gate leaves the user stuck.
  const savedIsVerified =
    isPhoneVerified ||
    Boolean(profile?.is_phone_number_verified && (profile.phone_number || "") === savedFull);
  const showVerified = savedFull !== "" && !isDirty && savedIsVerified;
  const canSend = phoneNumber.length === 10 && !showVerified;

  return (
    <div>
      {label && (
        <label className="block font-body text-sm text-foreground mb-1.5">{label}</label>
      )}
      <div className="flex flex-col sm:flex-row gap-2 mb-2">
        <div className="flex gap-2 flex-1">
          <div className="shrink-0 w-[120px] sm:w-[140px]">
            <Select value={countryCode} onValueChange={handleCountryCodeChange}>
              <SelectTrigger className={`w-full h-auto px-3.5 ${compact ? "py-2.5" : "py-3"} rounded-xl border border-gray-400 bg-background font-body text-base font-normal focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 transition-colors gap-1 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl w-[var(--radix-select-trigger-width)]">
                <SelectItem value="+91">+91 (IN)</SelectItem>
                <SelectItem value="+1">+1 (US)</SelectItem>
                <SelectItem value="+44">+44 (UK)</SelectItem>
                <SelectItem value="+61">+61 (AU)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <input
            type="text"
            value={phoneNumber}
            onChange={handlePhoneChange}
            placeholder="10-digit number"
            maxLength={10}
            className={`flex-1 min-w-0 px-4 ${compact ? "py-2.5" : "py-3"} rounded-xl border border-gray-400 bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors`}
          />
        </div>

        {/* Verify Button inlined with input */}
        {!mockOtpSent && !showVerified && (
          <button
            type="button"
            onClick={handleSendOtp}
            disabled={isSendingOtp || !canSend}
            className={`w-full sm:w-[100px] shrink-0 px-3 ${compact ? "py-2.5" : "py-3"} font-body text-sm font-medium rounded-xl border border-gray-400 transition-all shadow-sm flex items-center justify-center whitespace-nowrap ${canSend
              ? "bg-teal-700 text-white hover:bg-teal-800 active:scale-[0.98]"
              : "bg-gray-200 text-gray-400 cursor-not-allowed opacity-60 shadow-none"
              }`}
          >
            {isSendingOtp ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Wait
              </>
            ) : (
              "Verify"
            )}
          </button>
        )}
      </div>

      {/* Verification UI */}
      {phoneNumber.length === 10 && !showVerified && (
        <>
          {mockOtpSent && (
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                className="w-full sm:w-44 px-3 py-2 rounded-lg border border-gray-400 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex flex-1 sm:flex-none gap-2">
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={isVerifyingOtp || otp.length < 6}
                  className="flex-1 sm:flex-none flex items-center justify-center text-sm px-4 py-2 bg-teal-700 text-white font-medium rounded-lg hover:bg-teal-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-center"
                >
                  {isVerifyingOtp ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Checking
                    </>
                  ) : (
                    "Confirm"
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={isSendingOtp}
                  className="flex-1 sm:flex-none flex items-center justify-center text-sm px-3 py-2 border border-teal-700 text-teal-700 hover:bg-teal-50 active:scale-[0.98] rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-center"
                >
                  {isSendingOtp ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Sending
                    </>
                  ) : (
                    "Resend OTP"
                  )}
                </button>
              </div>
            </div>
          )}

          {otpError && <p className="text-sm text-destructive mt-1">{otpError}</p>}
        </>
      )}
      {/* Persistent verified state — shows on load for an already-verified number and
          immediately after a successful in-session verify (outside the isDirty gate,
          which goes false the moment the verify saves). */}
      {showVerified && <p className="text-sm text-green-600 font-medium mt-1">Phone verified ✅</p>}
    </div>
  );
}
