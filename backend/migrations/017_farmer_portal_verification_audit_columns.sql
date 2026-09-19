-- Document portal verification audit columns that were applied directly on Supabase
-- (Lovable / 02_SQL_SCHEMA_MIGRATION) but were not yet tracked in this repo.
-- Safe to re-run: uses IF NOT EXISTS throughout.

ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS verified_by_user_name text,
  ADD COLUMN IF NOT EXISTS cooperative_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cooperative_reviewed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS cooperative_reviewed_by_user_name text,
  ADD COLUMN IF NOT EXISTS cooperative_approval_status text,
  ADD COLUMN IF NOT EXISTS cooperative_rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_farmers_verified_at
  ON public.farmers (verified_at DESC);

-- One stale row: status=verified but verification_stage still pending_field_verification
-- (predates trigger 015). Align with sync_farmer_verification_from_status() for verified.
UPDATE public.farmers
SET
  verification_stage = 'pending_super_admin',
  field_verification_completed = TRUE,
  field_verification_timestamp = COALESCE(field_verification_timestamp, NOW())
WHERE status::text = 'verified'
  AND verification_stage = 'pending_field_verification';
