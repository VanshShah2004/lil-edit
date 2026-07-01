import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import AddressManager, { type Address } from "@/components/profile/AddressManager";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// Mocking OTP

export default function Profile() {
  const { user, profile, loading: authLoading } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{ first_name?: string; last_name?: string }>({});

  // Phone Auth State
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [savedPhone, setSavedPhone] = useState(""); // full phone (code + number) currently persisted
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [otp, setOtp] = useState("");
  const [mockOtpSent, setMockOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");

  // Personal Info State
  const [personalInfo, setPersonalInfo] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    gender: "",
  });
  // Last values persisted to the DB — used to skip redundant autosave writes.
  const savedInfoRef = useRef({ first_name: "", last_name: "", dob: "", gender: "" });

  // Addresses State
  const [addresses, setAddresses] = useState<Address[]>([]);

  useEffect(() => {
    if (user && profile) {
      const info = {
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        dob: profile.dob || "",
        gender: profile.gender || "",
      };
      setPersonalInfo(info);
      savedInfoRef.current = info;

      setSavedPhone(profile.phone_number || "");
      if (profile.phone_number) {
        const match = profile.phone_number.match(/^(\+\d{1,4})(\d{10})$/);
        if (match) {
          setCountryCode(match[1]);
          setPhoneNumber(match[2]);
        } else {
          setPhoneNumber(profile.phone_number);
        }
      }
      fetchAddresses();
    }
    // Intentionally re-syncs only when the user/profile identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhoneNumber(value);
    setIsPhoneVerified(false);
    setMockOtpSent(false);
    setOtp("");
    setOtpError("");
  };

  const handleCountryCodeChange = (value: string) => {
    setCountryCode(value);
    setIsPhoneVerified(false);
    setMockOtpSent(false);
    setOtp("");
    setOtpError("");
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

  // Writes a partial profile update straight to the DB and reflects status in the header.
  const persistProfile = async (
    partial: Record<string, string | boolean | null>
  ): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from("profiles")
        .update(partial)
        .eq("id", user.id);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Autosave failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save changes");
      return false;
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || !mockOtpSent || !user) return;

    try {
      setIsVerifyingOtp(true);
      setOtpError("");

      // Simulate network verification
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (otp !== "123456") {
        setOtpError("OTP does not match ❌");
        toast.error("Invalid OTP");
        return;
      }

      // Verified — persist the new number immediately.
      const fullPhone = `${countryCode}${phoneNumber}`;
      const ok = await persistProfile({ phone_number: fullPhone, is_phone_number_verified: true });
      if (!ok) {
        setOtpError("Verified, but saving failed. Please try again.");
        return;
      }

      setSavedPhone(fullPhone);
      setIsPhoneVerified(true);
      setMockOtpSent(false);
      toast.success("Phone verified & saved ✅");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const fetchAddresses = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAddresses(data || []);
    } catch (error) {
      console.error("Error fetching addresses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Required text fields persist on blur; empty values are flagged, not saved.
  const handleNameBlur = async (field: "first_name" | "last_name") => {
    const trimmed = personalInfo[field].trim();
    if (!trimmed) {
      setFieldErrors((prev) => ({ ...prev, [field]: "This field is required" }));
      return;
    }
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    if (trimmed !== personalInfo[field]) {
      setPersonalInfo((prev) => ({ ...prev, [field]: trimmed }));
    }
    if (trimmed === savedInfoRef.current[field]) return;

    const ok = await persistProfile({ [field]: trimmed });
    if (ok) savedInfoRef.current[field] = trimmed;
  };

  // Date / select fields persist as soon as a value is chosen.
  const handleFieldChange = async (field: "dob" | "gender", value: string) => {
    setPersonalInfo((prev) => ({ ...prev, [field]: value }));
    if (value === savedInfoRef.current[field]) return;
    const ok = await persistProfile({ [field]: value || null });
    if (ok) savedInfoRef.current[field] = value;
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      {user ? <UserNavbar /> : <Navbar />}

      <main className="flex-grow pt-[calc(var(--navbar-height)+25px)] pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-10 text-center">
            <h1 className="flex items-center justify-center gap-2 text-3xl md:text-4xl font-display text-teal-700 mb-3 font-semibold">
              My Profile <Sparkles className="w-6 h-6 md:w-7 md:h-7 text-teal-700" fill="currentColor" />
            </h1>
            <p className="text-muted-foreground font-body text-sm max-w-md mx-auto">
              Manage your personal details and delivery preferences
            </p>
          </div>

          <div className="space-y-8">

            {/* Account and personal information */}
            <div className="bg-[#F8F6FC] rounded-2xl shadow-[0_4px_20px_-4px_rgba(147,136,170,0.15)] border border-gray-400 overflow-hidden">
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[#EDEBF5] bg-[#F1EEF8]">
                <h3 className="text-lg font-body font-medium text-foreground">Account Information</h3>
              </div>
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="md:col-span-2">
                  <label className="block font-body text-sm text-foreground mb-1.5">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={profile?.email || ""}
                    className="w-full px-4 py-3 rounded-xl border border-gray-400 bg-secondary/30 font-body text-sm focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block font-body text-sm text-foreground mb-1.5">Phone Number</label>
                  <div className="flex flex-col sm:flex-row gap-2 mb-2">
                    <div className="flex gap-2 flex-1">
                      <div className="shrink-0 w-[90px] sm:w-[100px]">
                        <Select value={countryCode} onValueChange={handleCountryCodeChange}>
                          <SelectTrigger className="w-full h-auto px-2.5 py-3 rounded-xl border border-gray-400 bg-background font-body text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 transition-colors gap-0.5 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
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
                        className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-400 bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                      />
                    </div>

                    {/* Verify Button inlined with input */}
                    {!mockOtpSent && !isPhoneVerified && (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={isSendingOtp || phoneNumber.length !== 10 || `${countryCode}${phoneNumber}` === savedPhone}
                        className={`w-full sm:w-[100px] shrink-0 px-3 py-3 font-body text-sm font-medium rounded-xl border border-gray-400 transition-all shadow-sm flex items-center justify-center whitespace-nowrap ${phoneNumber.length === 10 && `${countryCode}${phoneNumber}` !== savedPhone
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
                  {phoneNumber.length === 10 && `${countryCode}${phoneNumber}` !== savedPhone && (
                    <>
                      {mockOtpSent && !isPhoneVerified && (
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
                              className="flex-1 sm:flex-none flex items-center justify-center text-sm px-3 py-2 text-teal-700 hover:bg-teal-50 active:scale-[0.98] rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-center"
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
                      {isPhoneVerified && <p className="text-sm text-green-600 font-medium mt-1">Phone verified ✅</p>}
                    </>
                  )}
                </div>
              </div>
              </div>

              <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-b border-[#EDEBF5] bg-[#F1EEF8]">
                <h3 className="text-lg font-body font-medium text-foreground">Personal Information</h3>
              </div>
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">
                    First Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={personalInfo.first_name}
                    onChange={(e) => {
                      setPersonalInfo({ ...personalInfo, first_name: e.target.value });
                      if (fieldErrors.first_name) setFieldErrors((p) => ({ ...p, first_name: undefined }));
                    }}
                    onBlur={() => handleNameBlur("first_name")}
                    className={`w-full px-4 py-3 rounded-xl border ${fieldErrors.first_name ? "border-destructive" : "border-gray-400"} bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors`}
                    placeholder="Enter first name"
                  />
                  {fieldErrors.first_name && <p className="text-sm text-destructive mt-1">{fieldErrors.first_name}</p>}
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">
                    Last Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={personalInfo.last_name}
                    onChange={(e) => {
                      setPersonalInfo({ ...personalInfo, last_name: e.target.value });
                      if (fieldErrors.last_name) setFieldErrors((p) => ({ ...p, last_name: undefined }));
                    }}
                    onBlur={() => handleNameBlur("last_name")}
                    className={`w-full px-4 py-3 rounded-xl border ${fieldErrors.last_name ? "border-destructive" : "border-gray-400"} bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors`}
                    placeholder="Enter last name"
                  />
                  {fieldErrors.last_name && <p className="text-sm text-destructive mt-1">{fieldErrors.last_name}</p>}
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Date of Birth</label>
                  <input
                    type="date"
                    value={personalInfo.dob}
                    onChange={(e) => handleFieldChange("dob", e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="w-full px-4 py-3 rounded-xl border border-gray-400 bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Gender</label>
                  <Select value={personalInfo.gender} onValueChange={(value) => handleFieldChange("gender", value)}>
                    <SelectTrigger className="w-full h-auto px-4 py-3 rounded-xl border border-gray-400 bg-background font-body text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-0 transition-colors">
                      <SelectValue placeholder="Select Gender" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 mb-8">
            {user && (
              <AddressManager
                addresses={addresses}
                userId={user.id}
                onChange={fetchAddresses}
              />
            )}
          </div>
        </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
