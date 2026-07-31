-- =============================================================================
-- Migration: Review Images Storage Bucket Setup
-- Created:   2026-06-16
-- Purpose:   Create storage bucket and RLS policies for review images
--
-- NOTE: Supabase Storage buckets cannot be created via SQL. This file documents
-- the setup that must be done manually via the Supabase Dashboard or API.
--
-- Manual Steps:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Create a bucket named "review-images"
-- 3. Set it as PUBLIC (so stored image URLs are publicly accessible)
-- 4. Run the SQL policies below to restrict uploads/deletes to authenticated users
-- =============================================================================

-- ─── Storage policies for review-images bucket ────────────────────────────────
-- These policies restrict who can upload/delete images while allowing public read.

-- Policy: Allow authenticated users to upload to their own user/product folders
CREATE POLICY "Allow users to upload review images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'review-images' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Allow authenticated users to delete their own images
CREATE POLICY "Allow users to delete their review images"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'review-images' AND
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Allow everyone to read (view) images
CREATE POLICY "Allow public read of review images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'review-images');

-- ─── Notes ────────────────────────────────────────────────────────────────────
-- • Image path format: reviews/{userId}/{productSlug}/{timestamp}-{random}.ext
-- • foldername(name)[1] extracts the first folder component (userId)
-- • Images expire after 1 year (cache-control header set by imageUpload.ts)
-- • Max file size: 5MB (enforced in imageUpload.ts)
-- • Allowed types: JPEG, PNG, WebP (enforced in imageUpload.ts)
