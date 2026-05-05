import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, MapPin, CheckCircle2, Home, Briefcase, Navigation, Star } from "lucide-react";

interface AddressManagerProps {
  addresses: any[];
  setAddresses: React.Dispatch<React.SetStateAction<any[]>>;
  setDeletedAddresses: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function AddressManager({ addresses, setAddresses, setDeletedAddresses }: AddressManagerProps) {
  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "home",
    label: "",
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
    is_default: false
  });



  const handlePincodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setForm((prev) => ({ ...prev, pincode: value }));

    if (value.length === 6) {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${value}`);
        const data = await res.json();
        if (data && data[0].Status === "Success") {
          const postOffice = data[0].PostOffice[0];
          setForm((prev) => ({
            ...prev,
            city: postOffice.District,
            state: postOffice.State,
            country: "India",
          }));
          toast.success("City and State auto-filled");
        }
      } catch (error) {
        console.error("Failed to fetch pincode details", error);
      }
    }
  };

  const openForm = (address: any = null) => {
    if (address) {
      setEditingId(address.id);
      setForm({
        type: address.type || "home",
        label: address.label || "",
        line1: address.line1 || "",
        line2: address.line2 || "",
        landmark: address.landmark || "",
        city: address.city || "",
        state: address.state || "",
        country: address.country || "",
        pincode: address.pincode || "",
        is_default: address.is_default || false
      });
    } else {
      setEditingId(null);
      setForm({
        type: "home",
        label: "",
        line1: "",
        line2: "",
        landmark: "",
        city: "",
        state: "",
        country: "",
        pincode: "",
        is_default: addresses.length === 0 // auto default if first
      });
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  const saveAddress = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.line1.trim() || !form.line2.trim() || !form.city.trim() || !form.state.trim() || !form.country.trim() || !form.pincode.trim()) {
      toast.error("Please fill all required address details");
      return;
    }

    if (form.pincode.length !== 6) {
      toast.error("Pincode must be 6 digits");
      return;
    }

    let finalType = form.type;
    let finalLabel = form.type === 'other' ? form.label : null;

    if (finalType === 'other' && finalLabel) {
      const lowerLabel = finalLabel.trim().toLowerCase();
      if (lowerLabel === 'home' || lowerLabel === 'work') {
        finalType = lowerLabel;
        finalLabel = null;
      }
    }

    const willBeDefault = form.is_default || addresses.length === 0;
    
    setAddresses((prev) => {
      let newList = [...prev];
      
      if (willBeDefault) {
        newList = newList.map(a => ({ ...a, is_default: false }));
      }

      const payload = {
        type: finalType,
        label: finalLabel,
        line1: form.line1,
        line2: form.line2,
        landmark: form.landmark,
        city: form.city,
        state: form.state,
        country: form.country,
        pincode: form.pincode,
        is_default: willBeDefault
      };

      if (editingId) {
        return newList.map(a => a.id === editingId ? { ...a, ...payload } : a);
      } else {
        const newAddress = { id: `temp-${Date.now()}`, ...payload };
        return [newAddress, ...newList];
      }
    });

    closeForm();
  };

  const deleteAddress = (id: string) => {
    if (!window.confirm("Delete this address?")) return;
    
    if (!id.startsWith('temp-')) {
      setDeletedAddresses((prev) => [...prev, id]);
    }
    setAddresses((prev) => prev.filter(a => a.id !== id));
  };

  const setDefault = (id: string) => {
    setAddresses((prev) => prev.map(a => ({
      ...a,
      is_default: a.id === id
    })));
  };

  const getIcon = (type: string) => {
    if (type === 'home') return <Home className="w-5 h-5 text-teal-700" />;
    if (type === 'work') return <Briefcase className="w-5 h-5 text-teal-700" />;
    return <MapPin className="w-5 h-5 text-teal-700" />;
  };



  return (
    <div className="bg-[#F8F6FC] rounded-2xl shadow-[0_4px_20px_-4px_rgba(147,136,170,0.15)] border border-[#EDEBF5] overflow-hidden">
      <div className="px-6 py-5 border-b border-[#EDEBF5] bg-[#F1EEF8] flex justify-between items-center">
        <h3 className="text-lg font-body font-medium text-foreground">Saved Addresses</h3>
        {!isFormOpen && (
          <button
            onClick={() => openForm()}
            className="inline-flex items-center text-sm font-medium text-teal-700 hover:text-teal-800 transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add New Address
          </button>
        )}
      </div>

      <div className="p-4 sm:p-6">
        {isFormOpen ? (
          <form onSubmit={saveAddress} className="space-y-6 bg-white p-6 rounded-xl border border-[#EDEBF5]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block font-body text-sm text-foreground mb-1.5">Address Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/30"
                >
                  <option value="home">Home</option>
                  <option value="work">Work</option>
                  <option value="other">Others</option>
                </select>
              </div>

              {form.type === "other" && (
                <div>
                  <label className="block font-body text-sm text-foreground mb-1.5">Name <span className="text-destructive">*</span></label>
                  <input
                    required
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="e.g. Gym, Hostel"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/30"
                  />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block font-body text-sm text-foreground mb-1.5">Address Line 1 <span className="text-destructive">*</span></label>
                <input
                  required
                  value={form.line1}
                  onChange={(e) => setForm({ ...form, line1: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/30"
                  placeholder="Apartment, unit, building, floor"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-body text-sm text-foreground mb-1.5">Address Line 2 <span className="text-destructive">*</span></label>
                <input
                  required
                  value={form.line2}
                  onChange={(e) => setForm({ ...form, line2: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/30"
                  placeholder="Street address"
                />
              </div>

              <div>
                <label className="block font-body text-sm text-foreground mb-1.5">Landmark (Optional)</label>
                <input
                  value={form.landmark}
                  onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/30"
                  placeholder="e.g. Near Apollo Hospital"
                />
              </div>

              <div>
                <label className="block font-body text-sm text-foreground mb-1.5">Pincode <span className="text-destructive">*</span></label>
                <input
                  required
                  value={form.pincode}
                  onChange={handlePincodeChange}
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/30"
                  placeholder="6-digit pincode"
                />
              </div>

              <div>
                <label className="block font-body text-sm text-foreground mb-1.5">City <span className="text-destructive">*</span></label>
                <input
                  required
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/30"
                />
              </div>

              <div>
                <label className="block font-body text-sm text-foreground mb-1.5">State <span className="text-destructive">*</span></label>
                <input
                  required
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/30"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-body text-sm text-foreground mb-1.5">Country <span className="text-destructive">*</span></label>
                <input
                  required
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/30"
                />
              </div>
              
              <div className="md:col-span-2 flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="defaultAddress" 
                  checked={form.is_default}
                  onChange={(e) => setForm({...form, is_default: e.target.checked})}
                  className="w-4 h-4 text-teal-700 rounded focus:ring-teal-700"
                />
                <label htmlFor="defaultAddress" className="text-sm font-medium">Set as default address</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={closeForm}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-8 py-2.5 bg-teal-700 text-white text-sm font-medium rounded-xl hover:bg-teal-800 transition-colors flex items-center"
              >
                Confirm Address
              </button>
            </div>
          </form>
        ) : addresses.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl border border-[#EDEBF5] border-dashed">
            <Navigation className="w-10 h-10 text-teal-200 mx-auto mb-3" />
            <h4 className="text-foreground font-medium mb-1">No addresses found</h4>
            <p className="text-muted-foreground text-sm mb-4">Add your delivery address to checkout faster.</p>
            <button
              onClick={() => openForm()}
              className="inline-flex items-center px-5 py-2.5 bg-teal-50 text-teal-700 font-medium text-sm rounded-xl hover:bg-teal-100 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Address
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <div key={addr.id} className={`p-5 bg-white rounded-xl border ${addr.is_default ? 'border-teal-500 shadow-sm' : 'border-[#EDEBF5]'} relative group transition-all`}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-teal-50 rounded-lg">
                      {getIcon(addr.type)}
                    </div>
                    <div>
                      <span className="font-semibold text-foreground capitalize">
                        {addr.type === 'other' ? addr.label : addr.type}
                      </span>
                      {addr.is_default && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800">
                          Default
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openForm(addr)} className="p-1.5 text-muted-foreground hover:text-teal-700 rounded-md hover:bg-teal-50 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteAddress(addr.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{addr.line1}</p>
                  {addr.line2 && <p>{addr.line2}</p>}
                  {addr.landmark && <p>Landmark: {addr.landmark}</p>}
                  <p>{addr.city}, {addr.state}</p>
                  <p>{addr.country} - {addr.pincode}</p>
                </div>
                
                {!addr.is_default && (
                  <button 
                    onClick={() => setDefault(addr.id)}
                    className="mt-4 text-xs font-medium text-teal-600 hover:text-teal-800 transition-colors"
                  >
                    Set as default
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
