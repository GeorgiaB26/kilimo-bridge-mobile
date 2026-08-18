-- Refugee member registration fields (humanitarian assistance)
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS refugee_status_document_url VARCHAR(255);
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS humanitarian_assistance_type VARCHAR(100);
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(50);
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255);
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20);
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS special_vulnerabilities TEXT;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS is_refugee BOOLEAN DEFAULT FALSE;
