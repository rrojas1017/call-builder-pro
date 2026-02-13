
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id uuid;
  assigned_role app_role;
BEGIN
  -- Check if an org_id was provided in user metadata (super admin creation flow)
  IF NEW.raw_user_meta_data->>'org_id' IS NOT NULL THEN
    new_org_id := (NEW.raw_user_meta_data->>'org_id')::uuid;
  ELSE
    -- Default: create a new organization for self-signup
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', 'My Organization') || '''s Org')
    RETURNING id INTO new_org_id;
  END IF;

  -- Insert profile
  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (NEW.id, new_org_id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  -- Determine role
  IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    assigned_role := (NEW.raw_user_meta_data->>'role')::app_role;
  ELSE
    assigned_role := 'admin';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);

  RETURN NEW;
END;
$function$;
