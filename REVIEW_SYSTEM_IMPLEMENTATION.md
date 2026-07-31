# Review System Implementation Summary

## Overview
A dual-review experience has been added to the Order Detail page, allowing customers to:
1. **Inline reviews** - Write reviews for each purchased item directly in the order
2. **Sidebar reviews** - Browse and contribute to reviews for the primary product in a dedicated sidebar card

## Frontend Components Created

### 0. **imageUpload.ts** (`src/lib/imageUpload.ts`)
Image storage utility library:
- `uploadReviewImage(userId, productSlug, file)` - Upload to Supabase Storage
- `createImagePreview(file)` - Generate blob URL for instant preview
- `revokeImagePreview(preview)` - Clean up blob URLs
- `deleteReviewImage(imageUrl)` - Remove uploaded image

**Constraints:**
- Max file size: 5MB
- Allowed types: JPEG, PNG, WebP
- Storage path: `reviews/{userId}/{productSlug}/{timestamp}-{random}.ext`
- Public read access (URLs in reviews are world-readable)

### 1. **reviewsApi.ts** (`src/lib/reviewsApi.ts`)
Client library for review operations. Provides:
- `fetchReviewsForProduct(slug)` - Get reviews + rating distribution
- `createReview(input)` - Create new review (RLS-enforced: user_id checked)
- `updateReview(productSlug, input)` - Edit existing review
- `deleteReview(productSlug)` - Remove review
- `getUserReviewForProduct(slug)` - Fetch user's review for a product

All methods use Supabase client auth (RLS policies guarantee users can only modify their own reviews).

### 2. **ReviewForm.tsx** (`src/components/reviews/ReviewForm.tsx`)
Reusable review form component with:
- **5-star rating picker** - Interactive hover/click to select
- **Title field** - Required, max 100 chars
- **Comment field** - Optional, max 500 chars
- **Image upload** - Up to 3 images (JPEG/PNG/WebP, max 5MB each)
  - Drag-drop or click to select
  - Instant preview with blob URLs
  - Remove button per image
  - Upload happens on submit (shows "Uploading images..." state)
- **Edit mode** - Displays existing review with verified badge indicator
- **Compact prop** - Toggles text size for inline vs sidebar use
- **Loading state** - Spinner during submission
- **Error display** - Shows validation/API errors

Usage:
```tsx
<ReviewForm
  productSlug="product-slug"
  existingReview={null}
  onSuccess={handleSuccess}
  onCancel={handleCancel}
  compact={true}  // for inline items
/>
```

### 3. **ReviewsList.tsx** (`src/components/reviews/ReviewsList.tsx`)
Displays reviews with statistics:
- **Rating summary** - Average rating (1 decimal) with star display
- **Distribution bars** - Visual % breakdown of 5★ to 1★ ratings
- **Individual reviews** - Shows top 5 with title, comment, verified badge
  - Images collapsed by default: "View {n} photo(s)" button
  - Click to expand 3-column grid of review images
- **Compact mode** - Summary-only (no individual reviews listed)

### 4. **ProductReviewsCard.tsx** (`src/components/reviews/ProductReviewsCard.tsx`)
Sidebar card combining form + reviews list for one product:
- Fetches reviews data + user's existing review on mount
- Shows "Add review" button or edit form (if user already reviewed)
- Displays rating summary + distribution bars
- Auto-updates after submission

## Integration into OrderDetail Page

### Changes to `src/pages/OrderDetail.tsx`

**State added:**
```tsx
const [expandedReviewItem, setExpandedReviewItem] = useState<string | null>(null);
const [featuredReviewProduct, setFeaturedReviewProduct] = useState<...>(null);
```

**Inline reviews** (per item):
- Each item now shows a "Write a review" button
- Clicking expands a ReviewForm directly below the item
- On success, form collapses and featured product updates (if it's the first item)

**Sidebar reviews** (featured product):
- First order item automatically set as the featured product
- ProductReviewsCard appears above "Buy Again" section
- Users can review this product and see others' reviews

## Backend Integration

### New: `lib/reviewsVerification.ts`
Fire-and-forget function called after order placement:
```ts
verifyReviewsForOrder(userId, orderItems, log)
```

**Logic:**
- After `place_order()` succeeds in checkout
- Finds all unverified reviews by this user for products in the order
- Updates them to `verified=true`

This enables the system to show:
```
✓ Verified purchase
```
badge on reviews for products the user actually bought.

### Updated: `routes/checkout.ts`
- Imports `verifyReviewsForOrder`
- Calls it in `afterPlacement()` as fire-and-forget task
- Never blocks checkout flow (email + review verification are parallel)

## Database & Storage

### Supabase Database
Uses existing `product_reviews` table (created 20260602):
- `verified` flag is **trigger-protected** (RLS + trigger prevent clients from forging it)
- Only `service_role` (backend) can set `verified=true`
- One review per (user, product) enforced by unique index
- Reviews survive product edits (no FK, matched by slug)
- `images TEXT[]` column stores array of image URLs (already in schema)

### Supabase Storage
Review images stored in `review-images` bucket:
- **Path structure:** `reviews/{userId}/{productSlug}/{timestamp}-{random}.ext`
- **Bucket type:** PUBLIC (images readable by everyone, but only owners can upload/delete)
- **RLS policies:** Restrict uploads to authenticated users in their own folder
- **Cache:** 1-year `cache-control` header (images are immutable)

**⚠️ SETUP REQUIRED:**
1. Go to Supabase Dashboard → Storage
2. Create bucket named `review-images` (PUBLIC)
3. The migration file `20260616_review_images_storage.sql` documents the RLS policies
   - These policies should be applied via SQL in the Supabase dashboard

## Workflow

### User Writes a Review (Inline)

1. User views an order detail page
2. Clicks "Write a review" on an item
3. ReviewForm expands
4. Fills in rating, title, comment
5. Clicks "Post review"
6. Frontend calls `createReview()` → Supabase RLS enforces ownership
7. Form collapses on success
8. User's review appears in sidebar card (if featured product)

### Verified Badge Appears

1. User submits review → review created with `verified=false` (trigger-enforced)
2. Later (or immediately if they haven't closed the form yet), they purchase an order with that product
3. Checkout `/verify` endpoint succeeds
4. `verifyReviewsForOrder()` runs fire-and-forget
5. Backend updates: `product_reviews.set(verified=true) WHERE user_id=X AND product_slug IN (...)`
6. User's review now displays `✓ Verified purchase` badge

### User Edits Existing Review

1. User clicks "Edit review" on a review they wrote
2. ReviewForm populates with their data
3. Makes changes
4. Clicks "Update review"
5. `updateReview()` called → RLS checks ownership
6. Form collapses, sidebar updates

## Styling & UX

- **Star ratings** - Amber (#FBBF24) when selected, gray otherwise
- **Compact form** - ~400px container, smaller text (inline on items)
- **Sidebar form** - Full width within 35% sidebar column
- **Color coding:**
  - Brand teal: buttons, verified badge outline
  - Emerald: verified badge background + "You saved" text
  - Amber: star ratings
  - Rose: error states

## Edge Cases Handled

✅ **User reviews before purchasing** → verified=false  
✅ **User reviews after purchasing** → verified=true (set by backend)  
✅ **One review per product per user** → Unique index enforces  
✅ **User deletes account** → Review survives (user_id=NULL but user_name preserved)  
✅ **Review network error** → Error message + form stays open  
✅ **Concurrent form submissions** → Loading state prevents double-click  
✅ **Product deleted** → Orphaned review harmless (no PDP renders it)  

## Testing Checklist

**Basic Workflow:**
- [ ] Write a review inline → see form expand/collapse
- [ ] Fill rating/title/comment → submit → see confirmation
- [ ] Edit existing review → change comment → update
- [ ] View sidebar reviews → see rating summary + distribution
- [ ] Place an order → verify badge appears on prior reviews
- [ ] Switch featured product (if needed) → sidebar updates
- [ ] Try to forge verified flag from browser → trigger blocks it
- [ ] Delete review → removed from list
- [ ] Scroll through multiple reviews → see top 5, "see all" link works

**Image Upload:**
- [ ] Click image upload → file picker opens
- [ ] Select 1 image → preview appears instantly (blob URL)
- [ ] Select 2 more images → shows "3/3", no more + button
- [ ] Remove image → preview disappears
- [ ] Try to upload 4th image → error "Maximum 3 images allowed"
- [ ] Try oversized file (>5MB) → error shown
- [ ] Try non-image file → error shown
- [ ] Submit review with 3 images → "Uploading images..." state shows
- [ ] After submit → review appears with images
- [ ] Click "View 3 photos" → grid expands
- [ ] Edit review → existing images still there
- [ ] Change an image → old one removed, new one uploaded
- [ ] Delete review with images → images removed from storage (fire-and-forget, may not be instant)

## Troubleshooting

**Images won't upload:**
- Check that `review-images` bucket exists in Supabase Storage (PUBLIC)
- Check RLS policies are applied to the bucket
- Check user is authenticated (images need `auth.uid()`)
- Check browser console for `[imageUpload]` logs

**Images won't display in reviews:**
- Check that bucket is PUBLIC (not private)
- Check that image URL is correct in `product_reviews.images` array
- Check fallback image `/fallback-product.webp` exists

**Images persisting after review delete:**
- Image deletion is fire-and-forget (happens async)
- If bucket has lifecycle rules, old images auto-expire
- Manual cleanup: Supabase Dashboard → Storage → review-images

## Future Enhancements

- Review filtering/sorting ("most helpful", "verified only")
- Review moderation dashboard (admin)
- Email notification when someone replies to your review
- Review aggregation API (show best/worst products)
- Incentives (points/coupon for verified reviews)
- Image lightbox modal (full-screen viewer)
- Drag-drop image reordering in form
- Automatic image compression before upload
- Image moderation (blur/flag inappropriate photos)
