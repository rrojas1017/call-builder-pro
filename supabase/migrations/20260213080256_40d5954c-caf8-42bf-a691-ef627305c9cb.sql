
-- Super admin can SELECT all organizations
CREATE POLICY "Super admins can view all organizations"
ON public.organizations
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can UPDATE all organizations
CREATE POLICY "Super admins can update all organizations"
ON public.organizations
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all profiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all user roles
CREATE POLICY "Super admins can view all user roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all agent_projects
CREATE POLICY "Super admins can view all agent projects"
ON public.agent_projects
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all calls
CREATE POLICY "Super admins can view all calls"
ON public.calls
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all campaigns (need to go through agent_projects)
CREATE POLICY "Super admins can view all campaigns"
ON public.campaigns
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all contacts
CREATE POLICY "Super admins can view all contacts"
ON public.contacts
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all dial_lists
CREATE POLICY "Super admins can view all dial lists"
ON public.dial_lists
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all credit_transactions
CREATE POLICY "Super admins can view all credit transactions"
ON public.credit_transactions
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all inbound_numbers
CREATE POLICY "Super admins can view all inbound numbers"
ON public.inbound_numbers
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can SELECT all agent_specs
CREATE POLICY "Super admins can view all agent specs"
ON public.agent_specs
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));
