
-- Test Lab tables
CREATE TABLE public.test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  max_calls int NOT NULL DEFAULT 5,
  concurrency int NOT NULL DEFAULT 1,
  agent_instructions_text text,
  spec_version int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.test_run_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id uuid NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  bland_call_id text,
  transcript text,
  extracted_data jsonb,
  evaluation jsonb,
  duration_seconds int,
  outcome text,
  error text,
  created_at timestamptz DEFAULT now(),
  called_at timestamptz
);

-- RLS
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_run_contacts ENABLE ROW LEVEL SECURITY;

-- test_runs policies (org-based)
CREATE POLICY "Users can view test runs in their org" ON public.test_runs
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can create test runs in their org" ON public.test_runs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update test runs in their org" ON public.test_runs
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- test_run_contacts policies (via test_runs org)
CREATE POLICY "Users can view test run contacts" ON public.test_run_contacts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.test_runs tr
    WHERE tr.id = test_run_id AND tr.org_id = public.get_user_org_id(auth.uid())
  ));

CREATE POLICY "Users can create test run contacts" ON public.test_run_contacts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.test_runs tr
    WHERE tr.id = test_run_id AND tr.org_id = public.get_user_org_id(auth.uid())
  ));

CREATE POLICY "Users can update test run contacts" ON public.test_run_contacts
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.test_runs tr
    WHERE tr.id = test_run_id AND tr.org_id = public.get_user_org_id(auth.uid())
  ));

-- Enable realtime for live test results
ALTER PUBLICATION supabase_realtime ADD TABLE public.test_run_contacts;
