
-- 1. Add join_code to organizations
ALTER TABLE public.organizations ADD COLUMN join_code text UNIQUE;

-- Generate codes for existing orgs
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT upper(substr(md5(gen_random_uuid()::text), 1, 6))
$$;

UPDATE public.organizations SET join_code = upper(substr(md5(gen_random_uuid()::text), 1, 6)) WHERE join_code IS NULL;

ALTER TABLE public.organizations ALTER COLUMN join_code SET DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 6));
ALTER TABLE public.organizations ALTER COLUMN join_code SET NOT NULL;

-- 2. Create join_requests table
CREATE TABLE public.join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  user_full_name text,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- Admins of the org can view and manage join requests
CREATE POLICY "Admins can manage join requests"
ON public.join_requests
FOR ALL
USING (
  (org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  (org_id = get_user_org_id(auth.uid()))
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

-- Users can view their own join requests
CREATE POLICY "Users can view own join requests"
ON public.join_requests
FOR SELECT
USING (user_id = auth.uid());

-- Super admins can see all
CREATE POLICY "Super admins can view all join requests"
ON public.join_requests
FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Service role can manage (for edge functions / triggers)
CREATE POLICY "Service role can manage join requests"
ON public.join_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Create a function to approve a join request
CREATE OR REPLACE FUNCTION public.approve_join_request(request_id uuid, approved boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req record;
  caller_org_id uuid;
BEGIN
  -- Get caller's org
  SELECT org_id INTO caller_org_id FROM profiles WHERE id = auth.uid();

  -- Verify caller is admin
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')) THEN
    RETURN json_build_object('error', 'Only admins can approve join requests');
  END IF;

  -- Get request
  SELECT * INTO req FROM join_requests WHERE id = request_id AND status = 'pending';
  IF req IS NULL THEN
    RETURN json_build_object('error', 'Request not found or already processed');
  END IF;

  -- Verify org match
  IF req.org_id != caller_org_id AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('error', 'Request is for a different organization');
  END IF;

  IF approved THEN
    -- Move user to the org
    UPDATE profiles SET org_id = req.org_id WHERE id = req.user_id;
    -- Set viewer role
    DELETE FROM user_roles WHERE user_id = req.user_id;
    INSERT INTO user_roles (user_id, role) VALUES (req.user_id, 'viewer');
    -- Mark approved
    UPDATE join_requests SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = request_id;
  ELSE
    -- Mark denied
    UPDATE join_requests SET status = 'denied', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = request_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- 4. Update handle_new_user to support join_code and pending state
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  assigned_role app_role;
  inv record;
  join_code_val text;
  target_org record;
BEGIN
  -- 1. Check for a pending invitation matching this user's email
  SELECT * INTO inv
  FROM public.org_invitations
  WHERE lower(email) = lower(NEW.email)
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF inv IS NOT NULL THEN
    new_org_id := inv.org_id;
    assigned_role := inv.role;
    UPDATE public.org_invitations SET status = 'accepted' WHERE id = inv.id;

  ELSIF NEW.raw_user_meta_data->>'org_id' IS NOT NULL THEN
    -- Admin/super_admin creation flow with explicit org
    new_org_id := (NEW.raw_user_meta_data->>'org_id')::uuid;
    assigned_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'admin');

  ELSIF NEW.raw_user_meta_data->>'join_code' IS NOT NULL THEN
    -- User signed up with a company join code
    join_code_val := upper(trim(NEW.raw_user_meta_data->>'join_code'));
    SELECT * INTO target_org FROM public.organizations WHERE join_code = join_code_val;
    
    IF target_org IS NOT NULL THEN
      -- Create profile with NULL org (pending approval)
      INSERT INTO public.profiles (id, org_id, full_name)
      VALUES (NEW.id, NULL, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
      
      -- Set a temporary viewer role
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
      
      -- Create join request
      INSERT INTO public.join_requests (user_id, user_email, user_full_name, org_id)
      VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), target_org.id);
      
      RETURN NEW;
    ELSE
      -- Invalid code, create as pending with no org
      INSERT INTO public.profiles (id, org_id, full_name)
      VALUES (NEW.id, NULL, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
      RETURN NEW;
    END IF;

  ELSE
    -- Self-signup without code: pending state (no org)
    INSERT INTO public.profiles (id, org_id, full_name)
    VALUES (NEW.id, NULL, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
    RETURN NEW;
  END IF;

  -- Standard path: insert profile with org
  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (NEW.id, new_org_id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);

  RETURN NEW;
END;
$$;
