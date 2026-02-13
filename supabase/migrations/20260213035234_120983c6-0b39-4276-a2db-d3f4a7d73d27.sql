
-- New table: dial_lists
CREATE TABLE public.dial_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  file_name text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  detected_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dial_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view dial lists"
  ON public.dial_lists FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage dial lists"
  ON public.dial_lists FOR ALL
  USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')))
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

-- New table: dial_list_rows (stores raw rows from uploaded CSV)
CREATE TABLE public.dial_list_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id uuid NOT NULL REFERENCES public.dial_lists(id) ON DELETE CASCADE,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dial_list_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view dial list rows"
  ON public.dial_list_rows FOR SELECT
  USING (EXISTS (SELECT 1 FROM dial_lists dl WHERE dl.id = dial_list_rows.list_id AND dl.org_id = get_user_org_id(auth.uid())));

CREATE POLICY "Admins can manage dial list rows"
  ON public.dial_list_rows FOR ALL
  USING (EXISTS (SELECT 1 FROM dial_lists dl WHERE dl.id = dial_list_rows.list_id AND dl.org_id = get_user_org_id(auth.uid())) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM dial_lists dl WHERE dl.id = dial_list_rows.list_id AND dl.org_id = get_user_org_id(auth.uid())) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

-- New table: campaign_lists (junction)
CREATE TABLE public.campaign_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES public.dial_lists(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, list_id)
);

ALTER TABLE public.campaign_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view campaign lists"
  ON public.campaign_lists FOR SELECT
  USING (EXISTS (SELECT 1 FROM campaigns c JOIN agent_projects ap ON ap.id = c.project_id WHERE c.id = campaign_lists.campaign_id AND ap.org_id = get_user_org_id(auth.uid())));

CREATE POLICY "Admins can manage campaign lists"
  ON public.campaign_lists FOR ALL
  USING (EXISTS (SELECT 1 FROM campaigns c JOIN agent_projects ap ON ap.id = c.project_id WHERE c.id = campaign_lists.campaign_id AND ap.org_id = get_user_org_id(auth.uid())) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c JOIN agent_projects ap ON ap.id = c.project_id WHERE c.id = campaign_lists.campaign_id AND ap.org_id = get_user_org_id(auth.uid())) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

-- Modify contacts table
ALTER TABLE public.contacts ADD COLUMN list_id uuid REFERENCES public.dial_lists(id);
ALTER TABLE public.contacts ADD COLUMN extra_data jsonb;

-- Modify campaigns table
ALTER TABLE public.campaigns ADD COLUMN agent_project_id uuid REFERENCES public.agent_projects(id);
