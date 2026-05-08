import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Save, Sparkles } from "lucide-react";
import Footer from "@/components/layout/Footer";
import UserNavbar from "@/components/home/UserNavbar";
import AddressManager from "@/components/profile/AddressManager";
// Mocking OTP

export default function Profile() {
  const { user, profile } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Phone Auth State
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
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

  // Addresses State
  const [addresses, setAddresses] = useState<any[]>([]);
  const [deletedAddresses, setDeletedAddresses] = useState<string[]>([]);

  useEffect(() => {
    if (user && profile) {
      setPersonalInfo({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        dob: profile.dob || "",
        gender: profile.gender || "",
      });

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
  }, [user, profile]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhoneNumber(value);
    setIsPhoneVerified(false);
    setMockOtpSent(false);
    setOtp("");
    setOtpError("");
  };

  const handleCountryCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCountryCode(e.target.value);
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
    } catch (error: any) {
      toast.error("Failed to send OTP");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || !mockOtpSent) return;

    try {
      setIsVerifyingOtp(true);
      setOtpError("");

      // Simulate network verification
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (otp === "123456") {
        setIsPhoneVerified(true);
        setMockOtpSent(false);
        toast.success("Phone verified ✅");
      } else {
        setOtpError("OTP does not match ❌");
        toast.error("Invalid OTP");
      }
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!personalInfo.first_name.trim() || !personalInfo.last_name.trim()) {
      toast.error("First name and last name are required");
      return;
    }

    // Address validation moved to AddressManager

    const fullPhone = `${countryCode}${phoneNumber}`;
    const initialPhone = profile?.phone_number || "";
    const isPhoneChanged = fullPhone !== initialPhone && phoneNumber.length > 0;

    if (isPhoneChanged && !isPhoneVerified) {
      toast.error("Please verify your phone number before saving");
      return;
    }

    setIsSaving(true);

    try {
      // 1. Update Profile
      const updateData: any = {
        first_name: personalInfo.first_name,
        last_name: personalInfo.last_name,
        dob: personalInfo.dob || null,
        gender: personalInfo.gender || null,
      };

      if (isPhoneChanged && isPhoneVerified) {
        updateData.phone_number = fullPhone;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

      if (profileError) throw profileError;

      // 2. Address updates
      for (const id of deletedAddresses) {
        await supabase.from("addresses").delete().eq("id", id);
      }

      for (const addr of addresses) {
        const { id, ...rest } = addr;
        const payload = { ...rest, user_id: user.id };

        if (id.startsWith('temp-')) {
          await supabase.from("addresses").insert(payload);
        } else {
          await supabase.from("addresses").update(payload).eq("id", id);
        }
      }

      setDeletedAddresses([]);
      fetchAddresses(); // Refresh list

      toast.success("Profile and addresses saved successfully");

    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      <UserNavbar />

      <main className="flex-grow pt-[7rem] md:pt-[6rem] pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-10 text-center">
            <h1 className="flex items-center justify-center gap-2 text-3xl md:text-4xl font-display text-teal-700 mb-3 font-semibold">
              My Profile <Sparkles className="w-6 h-6 md:w-7 md:h-7 text-teal-700" fill="currentColor" />
            </h1>
            <p className="text-muted-foreground font-body text-sm max-w-md mx-auto">
              Manage your personal details and delivery preferences
            </p>
          </div>

          <form id="profile-form" onSubmit={handleSave} className="space-y-8">

            {/* SECTION 1: ACCOUNT INFORMATION */}
            <div className="bg-[#F8F6FC] rounded-2xl shadow-[0_4px_20px_-4px_rgba(147,136,170,0.15)] border border-[#EDEBF5] overflow-hidden">
              <div className="px-6 py-5 border-b border-[#EDEBF5] bg-[#F1EEF8]">
                <h3 className="text-lg font-body font-medium text-foreground">Account Information</h3>
              </div>
              <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="md:col-span-2">
                  <label className="block font-body text-sm text-foreground mb-1.5">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={profile?.email || ""}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 font-body text-sm focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block font-body text-sm text-foreground mb-1.5">Phone Number</label>
                  <div className="flex flex-col sm:flex-row gap-2 mb-2">
                    <div className="flex gap-2 flex-1">
                      <select
                        value={countryCode}
                        onChange={handleCountryCodeChange}
                        className="w-[90px] sm:w-[100px] shrink-0 px-3 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                      >
                        <option value="+91">+91 (IN)</option>
                        <option value="+1">+1 (US)</option>
                        <option value="+44">+44 (UK)</option>
                        <option value="+61">+61 (AU)</option>
                      </select>
                      <input
                        type="text"
                        value={phoneNumber}
                        onChange={handlePhoneChange}
                        placeholder="10-digit number"
                        maxLength={10}
                        className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                      />
                    </div>

                    {/* Verify Button inlined with input */}
                    {!mockOtpSent && !isPhoneVerified && (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={isSendingOtp || phoneNumber.length !== 10 || `${countryCode}${phoneNumber}` === (profile?.phone_number || "")}
                        className={`w-full sm:w-[100px] shrink-0 px-3 py-3 font-body text-sm font-medium rounded-xl transition-all shadow-sm flex items-center justify-center whitespace-nowrap ${phoneNumber.length === 10 && `${countryCode}${phoneNumber}` !== (profile?.phone_number || "")
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
                  {phoneNumber.length === 10 && `${countryCode}${phoneNumber}` !== (profile?.phone_number || "") && (
                    <>
                      {mockOtpSent && !isPhoneVerified && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
                          <input
                            type="text"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="Enter 6-digit OTP"
                            className="w-full sm:w-44 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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

            {/* SECTION 2: PERSONAL INFORMATION */}
            <div className="bg-[#F8F6FC] rounded-2xl shadow-[0_4px_20px_-4px_rgba(147,136,170,0.15)] border border-[#EDEBF5] overflow-hidden">
              <div className="px-6 py-5 border-b border-[#EDEBF5] bg-[#F1EEF8]">
                <h3 className="text-lg font-body font-medium text-foreground">Personal Information</h3>
              </div>
              <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">
                    First Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={personalInfo.first_name}
                    onChange={(e) => setPersonalInfo({ ...personalInfo, first_name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="Enter first name"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">
                    Last Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={personalInfo.last_name}
                    onChange={(e) => setPersonalInfo({ ...personalInfo, last_name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="Enter last name"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Date of Birth</label>
                  <input
                    type="date"
                    value={personalInfo.dob}
                    onChange={(e) => setPersonalInfo({ ...personalInfo, dob: e.target.value })}
                    max={new Date().toISOString().split("T")[0]}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Gender</label>
                  <select
                    value={personalInfo.gender}
                    onChange={(e) => setPersonalInfo({ ...personalInfo, gender: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 3: ADDRESS INFORMATION is now below the form */}

          </form>

          <div className="mt-8 mb-8">
            <AddressManager
              addresses={addresses}
              setAddresses={setAddresses}
              setDeletedAddresses={setDeletedAddresses}
            />
          </div>

          {/* ACTION BUTTON */}
          <div className="flex justify-end pt-4 border-t border-[#EDEBF5] mt-4">
            <button
              type="submit"
              form="profile-form"
              disabled={isSaving || (`${countryCode}${phoneNumber}` !== (profile?.phone_number || "") && phoneNumber.length > 0 && !isPhoneVerified)}
              className="inline-flex items-center justify-center px-10 py-3.5 bg-teal-700 text-white font-body text-sm rounded-xl hover:bg-teal-800 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-md w-full sm:w-auto"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
