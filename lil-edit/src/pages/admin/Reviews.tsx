import AdminPageShell from "@/components/admin/AdminPageShell";
import ReviewsManager from "@/components/admin/ReviewsManager";

const Reviews = () => (
  <AdminPageShell
    title="Reviews"
    subtitle="Moderate customer reviews — verify the genuine ones and remove anything that shouldn't be there."
  >
    <ReviewsManager />
  </AdminPageShell>
);

export default Reviews;
