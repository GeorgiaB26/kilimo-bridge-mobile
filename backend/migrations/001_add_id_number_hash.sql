-- Add deterministic hash column for duplicate ID detection (encrypted values use random IVs).
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS id_number_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_farmers_id_number_hash
  ON farmers (id_number_hash)
  WHERE id_number_hash IS NOT NULL;
