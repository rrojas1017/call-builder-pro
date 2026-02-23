
-- Create crm_records table
CREATE TABLE public.crm_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  phone text NOT NULL,
  name text,
  email text,
  state text,
  zip_code text,
  age text,
  household_size text,
  income_est_annual text,
  coverage_type text,
  consent boolean,
  qualified boolean,
  transferred boolean DEFAULT false,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,
  total_calls integer NOT NULL DEFAULT 0,
  last_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  last_outcome text,
  source text DEFAULT 'call_webhook',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone)
);

-- Enable RLS
ALTER TABLE public.crm_records ENABLE ROW LEVEL SECURITY;

-- Org members can view their own org's records
CREATE POLICY "Org members can view crm records"
  ON public.crm_records FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

-- Admins can manage their org's records
CREATE POLICY "Admins can manage crm records"
  ON public.crm_records FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  )
  WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  );

-- Super admins can view all records
CREATE POLICY "Super admins can view all crm records"
  ON public.crm_records FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Indexes
CREATE INDEX idx_crm_records_org_id ON public.crm_records(org_id);
CREATE INDEX idx_crm_records_phone ON public.crm_records(phone);
CREATE INDEX idx_crm_records_qualified ON public.crm_records(qualified);
CREATE INDEX idx_crm_records_last_contacted ON public.crm_records(last_contacted_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_crm_records_updated_at
  BEFORE UPDATE ON public.crm_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
