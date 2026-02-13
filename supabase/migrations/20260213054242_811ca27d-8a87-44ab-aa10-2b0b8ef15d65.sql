
-- Create inbound_numbers table
CREATE TABLE public.inbound_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  phone_number text NOT NULL UNIQUE,
  project_id uuid REFERENCES public.agent_projects(id),
  label text,
  area_code text,
  status text NOT NULL DEFAULT 'active',
  monthly_cost_usd numeric NOT NULL DEFAULT 15,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inbound_numbers ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org members can view inbound numbers"
ON public.inbound_numbers FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage inbound numbers"
ON public.inbound_numbers FOR ALL
USING (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Add inbound_number_id to calls table
ALTER TABLE public.calls ADD COLUMN inbound_number_id uuid REFERENCES public.inbound_numbers(id);

-- Index for webhook lookups by phone number
CREATE INDEX idx_inbound_numbers_phone ON public.inbound_numbers(phone_number);
CREATE INDEX idx_inbound_numbers_org ON public.inbound_numbers(org_id);
CREATE INDEX idx_calls_inbound_number ON public.calls(inbound_number_id);
