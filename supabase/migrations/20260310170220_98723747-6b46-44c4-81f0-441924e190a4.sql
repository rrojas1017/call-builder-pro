
CREATE TABLE IF NOT EXISTS public.research_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  status text DEFAULT 'pending' NOT NULL,
  trigger_reason text,
  proposed_queries jsonb,
  humanness_score integer,
  knowledge_gaps jsonb,
  results jsonb,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

ALTER TABLE public.research_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view research requests"
  ON public.research_requests FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can update research requests"
  ON public.research_requests FOR UPDATE
  USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

CREATE POLICY "Service role can manage research requests"
  ON public.research_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
