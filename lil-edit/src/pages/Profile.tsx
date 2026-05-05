import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import Footer from "@/components/layout/Footer";
import UserNavbar from "@/components/home/UserNavbar";

export default function Profile() {
  const { user, profile } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Personal Info State
  const [personalInfo, setPersonalInfo] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    gender: "",
  });

  // Address State
  const [address, setAddress] = useState({
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
  });

  useEffect(() => {
    if (user && profile) {
      setPersonalInfo({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        dob: profile.dob || "",
        gender: profile.gender || "",
      });
      fetchAddress();
    }
  }, [user, profile]);

  const fetchAddress = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAddress({
          line1: data.line1 || "",
          line2: data.line2 || "",
          landmark: data.landmark || "",
          city: data.city || "",
          state: data.state || "",
          country: data.country || "",
          pincode: data.pincode || "",
        });
      }
    } catch (error) {
      console.error("Error fetching address:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePincodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setAddress((prev) => ({ ...prev, pincode: value }));

    if (value.length === 6) {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${value}`);
        const data = await res.json();
        if (data && data[0].Status === "Success") {
          const postOffice = data[0].PostOffice[0];
          setAddress((prev) => ({
            ...prev,
            city: postOffice.District,
            state: postOffice.State,
            country: "India",
          }));
          toast.success("City and State auto-filled from Pincode");
        }
      } catch (error) {
        console.error("Failed to fetch pincode details", error);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!personalInfo.first_name.trim() || !personalInfo.last_name.trim()) {
      toast.error("First name and last name are required");
      return;
    }

    if (address.pincode && address.pincode.length !== 6) {
      toast.error("Pincode must be exactly 6 digits");
      return;
    }

    setIsSaving(true);

    try {
      // 1. Update Profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: personalInfo.first_name,
          last_name: personalInfo.last_name,
          dob: personalInfo.dob || null,
          gender: personalInfo.gender || null,
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // 2. Upsert Address
      const addressPayload = {
        user_id: user.id,
        email: user.email,
        ...address,
      };

      const { error: addressError } = await supabase
        .from("addresses")
        .upsert(addressPayload, { onConflict: "user_id" });

      if (addressError) throw addressError;

      toast.success("Profile updated successfully");

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
            <h1 className="text-3xl md:text-4xl font-display text-teal-700 mb-3 font-semibold">My Profile</h1>
            <p className="text-muted-foreground font-body text-sm max-w-md mx-auto">
              Manage your personal details and delivery preferences
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-8">

            {/* SECTION 1: ACCOUNT INFORMATION */}
            <div className="bg-[#F8F6FC] rounded-2xl shadow-[0_4px_20px_-4px_rgba(147,136,170,0.15)] border border-[#EDEBF5] overflow-hidden">
              <div className="px-6 py-5 border-b border-[#EDEBF5] bg-[#F1EEF8]">
                <h3 className="text-lg font-body font-medium text-foreground">Account Information</h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={profile?.email || ""}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 font-body text-sm focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Phone Number</label>
                  <input
                    type="text"
                    disabled
                    value={profile?.phone_number || "Not provided"}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 font-body text-sm focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: PERSONAL INFORMATION */}
            <div className="bg-[#F8F6FC] rounded-2xl shadow-[0_4px_20px_-4px_rgba(147,136,170,0.15)] border border-[#EDEBF5] overflow-hidden">
              <div className="px-6 py-5 border-b border-[#EDEBF5] bg-[#F1EEF8]">
                <h3 className="text-lg font-body font-medium text-foreground">Personal Information</h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
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

            {/* SECTION 3: ADDRESS INFORMATION */}
            <div className="bg-[#F8F6FC] rounded-2xl shadow-[0_4px_20px_-4px_rgba(147,136,170,0.15)] border border-[#EDEBF5] overflow-hidden">
              <div className="px-6 py-5 border-b border-[#EDEBF5] bg-[#F1EEF8]">
                <h3 className="text-lg font-body font-medium text-foreground">Delivery Address</h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block font-body text-sm text-foreground mb-1.5">Address Line 1</label>
                  <input
                    type="text"
                    value={address.line1}
                    onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="Street address, P.O. box, company name, c/o"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block font-body text-sm text-foreground mb-1.5">Address Line 2</label>
                  <input
                    type="text"
                    value={address.line2}
                    onChange={(e) => setAddress({ ...address, line2: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="Apartment, suite, unit, building, floor, etc."
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Landmark</label>
                  <input
                    type="text"
                    value={address.landmark}
                    onChange={(e) => setAddress({ ...address, landmark: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="E.g. Near Apollo Hospital"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Pincode</label>
                  <input
                    type="text"
                    value={address.pincode}
                    onChange={handlePincodeChange}
                    maxLength={6}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="6-digit pincode"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">City</label>
                  <input
                    type="text"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">State</label>
                  <input
                    type="text"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="State"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block font-body text-sm text-foreground mb-1.5">Country</label>
                  <input
                    type="text"
                    value={address.country}
                    onChange={(e) => setAddress({ ...address, country: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
                    placeholder="Country"
                  />
                </div>
              </div>
            </div>

            {/* ACTION BUTTON */}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center px-10 py-3.5 bg-teal-600 text-white font-body text-sm rounded-xl hover:bg-teal-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-60 disabled:cursor-not-allowed shadow-md w-full sm:w-auto"
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
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
