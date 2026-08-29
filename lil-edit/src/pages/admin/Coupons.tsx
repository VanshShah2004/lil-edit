import AdminPageShell from "@/components/admin/AdminPageShell";
import CouponsManager from "@/components/admin/CouponsManager";

const Coupons = () => (
  <AdminPageShell
    title="Coupons"
    subtitle="Create discount codes, set their rules and limits, and switch them on or off."
  >
    <CouponsManager />
  </AdminPageShell>
);

export default Coupons;
