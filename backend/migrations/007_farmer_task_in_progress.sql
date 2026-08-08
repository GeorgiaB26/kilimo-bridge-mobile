-- Allow farmer task recall to land on in-progress (keep evidence for edit/resubmit).
-- Safe to re-run: skips when the label already exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'task_status' AND e.enumlabel = 'in-progress'
     )
  THEN
    ALTER TYPE task_status ADD VALUE 'in-progress';
  END IF;
END
$$;
