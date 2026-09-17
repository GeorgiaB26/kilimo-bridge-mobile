-- Equity Bank SFTP file-exchange: batches, response file ingest, and
-- bank_transactions columns for the three identifiers per payment line.
--
-- Additive only: keeps equity_reference for the existing H2H REST/webhook path.
-- Apply via: npx tsx scripts/apply-equity-batches-migration.ts
-- (or paste into Supabase SQL Editor).

-- ---------------------------------------------------------------------------
-- Batches (one outbound CSV file)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equity_payment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  entity_code TEXT NOT NULL,
  filename TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  value_date DATE NOT NULL,
  debit_account_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'generated',
      'uploaded',
      'accepted',
      'rejected',
      'partially_settled',
      'settled',
      'failed'
    )),
  row_count INTEGER NOT NULL DEFAULT 0,
  file_reference TEXT,
  ack_code TEXT,
  nack_summary TEXT,
  outbound_sha256 TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ,
  acked_at TIMESTAMPTZ,
  nacked_at TIMESTAMPTZ,
  psr_received_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(user_id),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT equity_payment_batches_filename_key UNIQUE (filename),
  CONSTRAINT equity_payment_batches_daily_seq_key UNIQUE (customer_id, value_date, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_equity_payment_batches_status
  ON equity_payment_batches (status, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_equity_payment_batches_file_reference
  ON equity_payment_batches (file_reference)
  WHERE file_reference IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Ingested ACK / NACK / PSR files (idempotent by content hash)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equity_response_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES equity_payment_batches(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ack', 'nack', 'psr')),
  filename TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  parse_summary JSONB,
  parsed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT equity_response_files_content_sha256_key UNIQUE (content_sha256)
);

CREATE INDEX IF NOT EXISTS idx_equity_response_files_batch
  ON equity_response_files (batch_id, kind);

CREATE INDEX IF NOT EXISTS idx_equity_response_files_filename
  ON equity_response_files (filename);

-- ---------------------------------------------------------------------------
-- bank_transactions: file-channel identifiers (H2H columns untouched)
-- ---------------------------------------------------------------------------
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES equity_payment_batches(id) ON DELETE SET NULL;

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS customer_reference TEXT;

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS equity_file_reference TEXT;

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS equity_transaction_id TEXT;

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS equity_payment_type TEXT;

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS equity_error_code TEXT;

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS equity_error_description TEXT;

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'h2h_api';

-- Backfill-safe: existing rows stay h2h_api; constrain after column exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_channel_check'
  ) THEN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT bank_transactions_channel_check
      CHECK (channel IN ('h2h_api', 'sftp_file'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_tx_batch_customer_reference
  ON bank_transactions (batch_id, customer_reference)
  WHERE batch_id IS NOT NULL AND customer_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_equity_file_reference
  ON bank_transactions (equity_file_reference)
  WHERE equity_file_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_equity_transaction_id
  ON bank_transactions (equity_transaction_id)
  WHERE equity_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_customer_reference
  ON bank_transactions (customer_reference)
  WHERE customer_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_batch_status
  ON bank_transactions (batch_id, status)
  WHERE batch_id IS NOT NULL;
