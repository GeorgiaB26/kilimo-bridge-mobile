-- One-time backfill: verified farmers verified before the status→portal sync trigger
-- only had farmers.status updated; portal audit columns were never set.

UPDATE public.farmers
SET
  field_verification_completed = TRUE,
  field_verification_timestamp = COALESCE(updated_at, created_at)
WHERE status::text = 'verified'
  AND field_verification_completed = FALSE;
