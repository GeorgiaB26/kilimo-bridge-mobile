-- Farmer self-serve profile photo updates wait for field-agent approval.
ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS pending_picture_url TEXT;
