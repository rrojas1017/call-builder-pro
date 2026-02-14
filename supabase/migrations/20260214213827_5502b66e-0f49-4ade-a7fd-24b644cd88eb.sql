
-- Score snapshots: track per-version, per-voice average scores
CREATE TABLE public.score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  spec_version INTEGER NOT NULL,
  voice_id TEXT,
  avg_humanness NUMERIC,
  avg_naturalness NUMERIC,
  avg_overall NUMERIC,
  call_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for upsert: one row per project+version+voice
CREATE UNIQUE INDEX idx_score_snapshots_unique 
  ON public.score_snapshots (project_id, spec_version, COALESCE(voice_id, '__null__'));

-- Index for fast lookups by project
CREATE INDEX idx_score_snapshots_project ON public.score_snapshots (project_id, spec_version DESC);

-- Enable RLS
ALTER TABLE public.score_snapshots ENABLE ROW LEVEL SECURITY;

-- Org members can view snapshots for their projects
CREATE POLICY "Org members can view score snapshots"
  ON public.score_snapshots
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agent_projects ap
    WHERE ap.id = score_snapshots.project_id
    AND ap.org_id = get_user_org_id(auth.uid())
  ));

-- No direct insert/update/delete from client — only service role (edge functions) writes
