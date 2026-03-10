
-- spec_change_log: tracks every modification to agent specs
CREATE TABLE public.spec_change_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.agent_projects(id) ON DELETE CASCADE NOT NULL,
  org_id uuid NOT NULL,
  field_changed text NOT NULL,
  old_value text,
  new_value text,
  change_type text NOT NULL DEFAULT 'patch',
  source text NOT NULL,
  source_category text,
  source_detail text,
  conflict_detected boolean DEFAULT false,
  conflict_description text,
  was_auto_applied boolean DEFAULT false,
  was_user_approved boolean DEFAULT false,
  approved_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_spec_change_log_project ON public.spec_change_log(project_id, created_at DESC);

ALTER TABLE public.spec_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view spec change logs"
  ON public.spec_change_log FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage spec change logs"
  ON public.spec_change_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- pending_spec_changes: holds conflicting changes for human review
CREATE TABLE public.pending_spec_changes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.agent_projects(id) ON DELETE CASCADE NOT NULL,
  org_id uuid NOT NULL,
  field_to_change text NOT NULL,
  current_value text,
  proposed_value text,
  change_type text,
  source text NOT NULL,
  source_category text,
  source_detail text,
  conflict_type text,
  conflict_description text NOT NULL,
  affected_fields jsonb,
  impact_summary text,
  status text DEFAULT 'pending' NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pending_changes_project ON public.pending_spec_changes(project_id, status, created_at DESC);

ALTER TABLE public.pending_spec_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view pending spec changes"
  ON public.pending_spec_changes FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can update pending spec changes"
  ON public.pending_spec_changes FOR UPDATE
  USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "Service role can manage pending spec changes"
  ON public.pending_spec_changes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
