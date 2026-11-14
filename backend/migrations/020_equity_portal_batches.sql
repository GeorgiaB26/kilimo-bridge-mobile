-- Equity Bank SFTP: second batch source = payment lines released in the Lovable portal
-- (payment_lines / payment_batches). The original source (payments table) is unchanged.
--
-- A bank_transactions row now belongs to EXACTLY ONE of:
--   payment_id       -> payments.id        (original Kilimo payments path)
--   payment_line_id  -> payment_lines.id   (portal path)
--
-- Idempotent. Apply via: npx tsx scripts/apply-equity-batches-migration.ts
-- (runs after 018 and 019 so RLS on equity_payment_batches is already in place).
--
-- payment_line_id and portal_batch_id are intentionally plain UUID columns without foreign
-- keys: the portal tables are owned by the portal and may be reshaped there, and the bank
-- ledger rows must outlive any portal-side clean-up.

-- ---------------------------------------------------------------------------
-- bank_transactions: portal payment line reference
-- ---------------------------------------------------------------------------
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS payment_line_id UUID;

ALTER TABLE public.bank_transactions
  ALTER COLUMN payment_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bank_transactions_one_source_check'
       AND conrelid = 'public.bank_transactions'::regclass
  ) THEN
    ALTER TABLE public.bank_transactions
      ADD CONSTRAINT bank_transactions_one_source_check
      CHECK (num_nonnulls(payment_id, payment_line_id) = 1);
  END IF;
END $$;

-- One payment line has at most one LIVE bank transaction (pending / processing / completed).
-- failed rows do not block, so a line can be re-sent after our own upload failure.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_tx_payment_line_live
  ON public.bank_transactions (payment_line_id)
  WHERE payment_line_id IS NOT NULL
    AND status IN ('pending', 'processing', 'completed');

CREATE INDEX IF NOT EXISTS idx_bank_tx_payment_line
  ON public.bank_transactions (payment_line_id)
  WHERE payment_line_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- equity_payment_batches: which portal batch a file was built from (NULL = payments path)
-- ---------------------------------------------------------------------------
ALTER TABLE public.equity_payment_batches
  ADD COLUMN IF NOT EXISTS portal_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_equity_payment_batches_portal_batch
  ON public.equity_payment_batches (portal_batch_id)
  WHERE portal_batch_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: same posture as 019. The table-level policies (is_banking() OR is_platform()) already
-- cover the new column. Re-assert RLS so this migration is safe on its own; policies are not
-- touched here.
-- ---------------------------------------------------------------------------
ALTER TABLE public.equity_payment_batches ENABLE ROW LEVEL SECURITY;
