-- Move payment creation from task approval → QC approval (run in Supabase SQL Editor).
-- Application code also creates payments on QC pass (see createPaymentOnQcApproval).

-- Remove task-approval payment trigger (names may vary — safe IF EXISTS).
DROP TRIGGER IF EXISTS trg_create_payment_on_task_approval ON farmer_tasks;
DROP TRIGGER IF EXISTS create_payment_on_task_approval ON farmer_tasks;
DROP TRIGGER IF EXISTS on_farmer_task_approved ON farmer_tasks;

DROP FUNCTION IF EXISTS create_payment_on_task_approval();
DROP FUNCTION IF EXISTS public.create_payment_on_task_approval();

-- Optional DB trigger on QC pass (disabled if you rely on API-only payment creation).
-- Uncomment only if you want Postgres to create payments AND disable app-level createPaymentOnQcApproval.

-- CREATE OR REPLACE FUNCTION create_payment_on_qc_approval()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--   IF NEW.quality_status = 'passed' AND (OLD.quality_status IS DISTINCT FROM 'passed') THEN
--     INSERT INTO payments (id, farmer_id, description, amount, payment_status, payment_method)
--     SELECT gen_random_uuid()::text, NEW.farmer_id, 'QC:' || NEW.id,
--            GREATEST(1, ROUND(COALESCE(NEW.marketplace_price_per_unit, 0) * NEW.quantity_received))::int,
--            'pending', 'M-Pesa'
--     WHERE NOT EXISTS (SELECT 1 FROM payments WHERE description = 'QC:' || NEW.id);
--   END IF;
--   RETURN NEW;
-- END;
-- $$;

-- CREATE TRIGGER trg_create_payment_on_qc_approval
--   AFTER UPDATE OF quality_status ON centre_inventory
--   FOR EACH ROW
--   EXECUTE FUNCTION create_payment_on_qc_approval();
