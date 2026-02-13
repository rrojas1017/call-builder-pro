
-- Add credits columns to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS credits_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Allow admins to update their own org
CREATE POLICY "Admins can update own org"
ON public.organizations
FOR UPDATE
USING (id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

-- Allow org members to view profiles in their org (for team list)
CREATE POLICY "Org members can view org profiles"
ON public.profiles
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- Allow admins to view roles for users in their org
CREATE POLICY "Admins can view org user roles"
ON public.user_roles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id AND p.org_id = get_user_org_id(auth.uid())
  )
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Create org_invitations table
CREATE TABLE public.org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view invitations"
ON public.org_invitations FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage invitations"
ON public.org_invitations FOR ALL
USING (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
);

-- Create credit_transactions table
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL,
  description text,
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view credit transactions"
ON public.credit_transactions FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- Security definer function: manage_team_member_role
CREATE OR REPLACE FUNCTION public.manage_team_member_role(
  target_user_id uuid,
  new_role app_role,
  action text -- 'assign' or 'remove'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_org_id uuid;
  target_org_id uuid;
BEGIN
  -- Get caller's org
  SELECT org_id INTO caller_org_id FROM profiles WHERE id = auth.uid();
  IF caller_org_id IS NULL THEN
    RETURN json_build_object('error', 'Caller has no organization');
  END IF;

  -- Verify caller is admin
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RETURN json_build_object('error', 'Only admins can manage roles');
  END IF;

  -- Verify target is in same org
  SELECT org_id INTO target_org_id FROM profiles WHERE id = target_user_id;
  IF target_org_id IS NULL OR target_org_id != caller_org_id THEN
    RETURN json_build_object('error', 'User not in your organization');
  END IF;

  -- Prevent self-demotion from admin
  IF target_user_id = auth.uid() AND action = 'remove' AND new_role = 'admin' THEN
    RETURN json_build_object('error', 'Cannot remove your own admin role');
  END IF;

  -- Prevent assigning super_admin
  IF new_role = 'super_admin' AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('error', 'Only super_admins can assign super_admin role');
  END IF;

  IF action = 'assign' THEN
    -- Delete existing role and insert new one
    DELETE FROM user_roles WHERE user_id = target_user_id;
    INSERT INTO user_roles (user_id, role) VALUES (target_user_id, new_role);
  ELSIF action = 'remove' THEN
    DELETE FROM user_roles WHERE user_id = target_user_id AND role = new_role;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- Security definer function: accept_invitation
CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  caller_email text;
BEGIN
  -- Get caller email
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  
  -- Get invitation
  SELECT * INTO inv FROM org_invitations WHERE id = invitation_id AND status = 'pending';
  IF inv IS NULL THEN
    RETURN json_build_object('error', 'Invitation not found or already used');
  END IF;

  -- Verify email matches
  IF lower(inv.email) != lower(caller_email) THEN
    RETURN json_build_object('error', 'This invitation is for a different email');
  END IF;

  -- Check expiry
  IF inv.expires_at < now() THEN
    UPDATE org_invitations SET status = 'expired' WHERE id = invitation_id;
    RETURN json_build_object('error', 'Invitation has expired');
  END IF;

  -- Move user to the inviting org
  UPDATE profiles SET org_id = inv.org_id WHERE id = auth.uid();

  -- Set their role
  DELETE FROM user_roles WHERE user_id = auth.uid();
  INSERT INTO user_roles (user_id, role) VALUES (auth.uid(), inv.role);

  -- Mark invitation as accepted
  UPDATE org_invitations SET status = 'accepted' WHERE id = invitation_id;

  RETURN json_build_object('success', true, 'org_id', inv.org_id);
END;
$$;
