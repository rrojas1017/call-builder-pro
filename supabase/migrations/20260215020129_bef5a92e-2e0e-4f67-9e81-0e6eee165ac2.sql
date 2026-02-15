
-- Create outbound_numbers table
CREATE TABLE public.outbound_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'untrusted',
  notes TEXT,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint on org + phone
ALTER TABLE public.outbound_numbers ADD CONSTRAINT outbound_numbers_org_phone_unique UNIQUE (org_id, phone_number);

-- Enable RLS
ALTER TABLE public.outbound_numbers ENABLE ROW LEVEL SECURITY;

-- Org members can view their org's outbound numbers
CREATE POLICY "Org members can view outbound numbers"
ON public.outbound_numbers
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- Admins can manage outbound numbers
CREATE POLICY "Admins can manage outbound numbers"
ON public.outbound_numbers
FOR ALL
USING (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Super admins can view all
CREATE POLICY "Super admins can view all outbound numbers"
ON public.outbound_numbers
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));
