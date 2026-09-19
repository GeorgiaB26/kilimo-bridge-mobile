-- Farmer-picked start date when they tap Start Task (not assignment time).
ALTER TABLE farmer_tasks
  ADD COLUMN IF NOT EXISTS farmer_started_at DATE;

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS farmer_started_at DATE;
