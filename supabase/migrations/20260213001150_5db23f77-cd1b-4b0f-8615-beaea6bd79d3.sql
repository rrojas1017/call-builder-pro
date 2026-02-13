
CREATE TABLE public.agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'conversation_technique',
  content TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'auto_research',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_knowledge_project_id ON public.agent_knowledge(project_id);
CREATE INDEX idx_agent_knowledge_category ON public.agent_knowledge(category);

ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view agent knowledge"
ON public.agent_knowledge
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM agent_projects ap
  WHERE ap.id = agent_knowledge.project_id
  AND ap.org_id = get_user_org_id(auth.uid())
));

CREATE POLICY "Admins can manage agent knowledge"
ON public.agent_knowledge
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM agent_projects ap
    WHERE ap.id = agent_knowledge.project_id
    AND ap.org_id = get_user_org_id(auth.uid())
  )
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);
