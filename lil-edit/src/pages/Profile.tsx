import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import UserNavbar from "@/components/home/UserNavbar";
import AddressManager, { type Address } from "@/components/profile/AddressManager";
import PhoneVerify from "@/components/profile/PhoneVerify";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Profile() {
  const { user, profile, loading: authLoading } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{ first_name?: string; last_name?: string }>({});

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

      fetchAddresses();
    }
    // Intentionally re-syncs only when the user/profile identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile]);

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
                  <PhoneVerify savedPhone={profile?.phone_number || ""} />
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
