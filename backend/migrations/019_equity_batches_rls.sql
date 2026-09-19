-- URGENT: equity_payment_batches / equity_response_files were created without RLS.
-- Same class of gap as program_projects — public schema exposed to PostgREST.
--
-- Access model mirrors bank_transactions write path (sensitive payment processing):
--   is_banking() OR is_platform() for SELECT and ALL writes.
-- Farmers/agents must NOT read batch files or raw ACK/NACK/PSR payloads
-- (debit accounts, filenames, full response bodies).

ALTER TABLE public.equity_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equity_response_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equity_batches_read ON public.equity_payment_batches;
DROP POLICY IF EXISTS equity_batches_write ON public.equity_payment_batches;
DROP POLICY IF EXISTS equity_response_files_read ON public.equity_response_files;
DROP POLICY IF EXISTS equity_response_files_write ON public.equity_response_files;

CREATE POLICY equity_batches_read
  ON public.equity_payment_batches
  FOR SELECT
  TO authenticated
  USING (is_banking() OR is_platform());

CREATE POLICY equity_batches_write
  ON public.equity_payment_batches
  FOR ALL
  TO authenticated
  USING (is_banking() OR is_platform())
  WITH CHECK (is_banking() OR is_platform());

CREATE POLICY equity_response_files_read
  ON public.equity_response_files
  FOR SELECT
  TO authenticated
  USING (is_banking() OR is_platform());

CREATE POLICY equity_response_files_write
  ON public.equity_response_files
  FOR ALL
  TO authenticated
  USING (is_banking() OR is_platform())
  WITH CHECK (is_banking() OR is_platform());
