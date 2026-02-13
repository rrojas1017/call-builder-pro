
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _entity_type text;
  _entity_id text;
  _action text;
  _details jsonb;
  _user_id uuid;
BEGIN
  _entity_type := TG_TABLE_NAME;

  IF TG_OP = 'DELETE' THEN
    _entity_id := OLD.id::text;
    _action := _entity_type || '.deleted';
    _details := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    _entity_id := NEW.id::text;
    _action := _entity_type || '.created';
    _details := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _entity_id := NEW.id::text;
    _action := _entity_type || '.updated';
    _details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  END IF;

  -- Get org_id based on table
  IF TG_TABLE_NAME = 'agent_specs' THEN
    -- agent_specs has no org_id column, look it up via agent_projects
    IF TG_OP = 'DELETE' THEN
      SELECT ap.org_id INTO _org_id FROM agent_projects ap WHERE ap.id = OLD.project_id;
    ELSE
      SELECT ap.org_id INTO _org_id FROM agent_projects ap WHERE ap.id = NEW.project_id;
    END IF;
  ELSIF TG_TABLE_NAME IN ('agent_projects','dial_lists','inbound_numbers','org_invitations') THEN
    IF TG_OP = 'DELETE' THEN
      _org_id := OLD.org_id;
    ELSE
      _org_id := NEW.org_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'campaigns' THEN
    -- campaigns has no org_id, look up via agent_projects
    IF TG_OP = 'DELETE' THEN
      SELECT ap.org_id INTO _org_id FROM agent_projects ap WHERE ap.id = OLD.project_id;
    ELSE
      SELECT ap.org_id INTO _org_id FROM agent_projects ap WHERE ap.id = NEW.project_id;
    END IF;
  END IF;

  _user_id := auth.uid();

  PERFORM log_audit_event(_org_id, _user_id, NULL, _action, _entity_type, _entity_id, _details, NULL);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
