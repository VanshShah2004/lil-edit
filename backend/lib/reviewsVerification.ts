import { supabaseAdmin } from "./supabase.js";
import { createLog, type OpLogger } from "./logger.js";

/**
 * Mark reviews as verified after order placement.
 * Called fire-and-forget after place_order succeeds — never blocks the checkout flow.
 *
 * Finds all unverified reviews the user wrote for products in this order and
 * marks them as verified (since we've now confirmed a real purchase).
 */
export async function verifyReviewsForOrder(
  userId: string,
  orderItems: Array<{ productSlug: string }>,
  log?: OpLogger,
): Promise<void> {
  const logger = log || createLog();
  try {
    const slugs = orderItems.map((it) => it.productSlug);
    if (slugs.length === 0) return;

    logger.step(`verifying reviews  user=${userId}  products=${slugs.length}`);

    const { error } = await supabaseAdmin
      .from("product_reviews")
      .update({ verified: true })
      .eq("user_id", userId)
      .eq("verified", false)
      .in("product_slug", slugs);

    if (error) {
      logger.warn(`review verification failed  ${error.message}`);
      return;
    }

    logger.step(`reviews verified`);
  } catch (err) {
    logger.warn("review verification error", err);
  }
}
