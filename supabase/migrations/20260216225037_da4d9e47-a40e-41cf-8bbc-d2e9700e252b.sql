
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id uuid;
  assigned_role app_role;
  inv record;
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
    -- Use the invited org and role
    new_org_id := inv.org_id;
    assigned_role := inv.role;

    -- Mark invitation as accepted
    UPDATE public.org_invitations SET status = 'accepted' WHERE id = inv.id;

  ELSIF NEW.raw_user_meta_data->>'org_id' IS NOT NULL THEN
    -- Super admin creation flow with explicit org
    new_org_id := (NEW.raw_user_meta_data->>'org_id')::uuid;
    assigned_role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'admin');

  ELSE
    -- Default: create a new organization for self-signup
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', 'My Organization') || '''s Org')
    RETURNING id INTO new_org_id;
    assigned_role := 'admin';
  END IF;

  -- Insert profile
  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (NEW.id, new_org_id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Insert role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);

  RETURN NEW;
END;
$function$;
