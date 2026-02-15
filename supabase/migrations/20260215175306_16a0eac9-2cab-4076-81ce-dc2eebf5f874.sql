
CREATE TABLE public.training_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  claude_results JSONB,
  gpt_results JSONB,
  merged_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.training_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org audits"
  ON public.training_audits FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert their org audits"
  ON public.training_audits FOR INSERT
  WITH CHECK (org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  ));
