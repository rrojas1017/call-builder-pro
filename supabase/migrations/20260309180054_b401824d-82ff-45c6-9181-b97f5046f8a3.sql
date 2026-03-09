
-- Create knowledge_api_endpoints table
CREATE TABLE public.knowledge_api_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  endpoint_url text NOT NULL,
  http_method text NOT NULL DEFAULT 'GET',
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  query_template text,
  response_path text,
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_api_endpoints ENABLE ROW LEVEL SECURITY;

-- Admins can manage endpoints in their org
CREATE POLICY "Admins can manage api endpoints"
ON public.knowledge_api_endpoints
FOR ALL
TO public
USING (
  (org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
)
WITH CHECK (
  (org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Org members can view endpoints
CREATE POLICY "Org members can view api endpoints"
ON public.knowledge_api_endpoints
FOR SELECT
TO public
USING (org_id = get_user_org_id(auth.uid()));

-- Super admins can view all
CREATE POLICY "Super admins can view all api endpoints"
ON public.knowledge_api_endpoints
FOR SELECT
TO public
USING (has_role(auth.uid(), 'super_admin'::app_role));
