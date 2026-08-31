-- URGENT: program_projects had 5 RLS policies but RLS was never enabled.
-- Without this, authenticated role could read/write all rows via PostgREST.
ALTER TABLE public.program_projects ENABLE ROW LEVEL SECURITY;
