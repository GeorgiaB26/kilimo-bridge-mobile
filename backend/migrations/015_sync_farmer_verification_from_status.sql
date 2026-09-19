-- Keep Lovable portal verification columns aligned when Express/mobile updates farmers.status.
-- Mobile field-agent verify only sets status; this trigger mirrors portal workflow fields.

CREATE OR REPLACE FUNCTION public.sync_farmer_verification_from_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  CASE NEW.status::text
    WHEN 'pending_review' THEN
      NEW.verification_stage := 'pending_super_admin';
      NEW.field_verification_completed := FALSE;
      NEW.field_verification_timestamp := NULL;

    WHEN 'pending_field_verification' THEN
      NEW.verification_stage := 'pending_field_verification';
      NEW.field_verification_completed := FALSE;
      NEW.field_verification_timestamp := NULL;

    WHEN 'verified' THEN
      NEW.verification_stage := 'pending_super_admin';
      NEW.field_verification_completed := TRUE;
      NEW.field_verification_timestamp := COALESCE(NEW.field_verification_timestamp, NOW());

    WHEN 'rejected' THEN
      -- Field visit decision recorded; stage may already reflect portal routing.
      NEW.field_verification_completed := TRUE;
      NEW.field_verification_timestamp := COALESCE(NEW.field_verification_timestamp, NOW());

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_farmers_sync_verification_from_status ON public.farmers;

CREATE TRIGGER trg_farmers_sync_verification_from_status
  BEFORE INSERT OR UPDATE OF status ON public.farmers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_farmer_verification_from_status();
