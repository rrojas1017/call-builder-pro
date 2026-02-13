
-- 1. Create audit_logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for common queries
CREATE INDEX idx_audit_logs_org_created ON public.audit_logs (org_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs (user_id);

-- 2. Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can read
CREATE POLICY "Super admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- No client INSERT/UPDATE/DELETE — only via security definer function

-- 3. log_audit_event function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _org_id uuid,
  _user_id uuid DEFAULT NULL,
  _user_email text DEFAULT NULL,
  _action text DEFAULT 'unknown',
  _entity_type text DEFAULT NULL,
  _entity_id text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb,
  _ip_address text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (org_id, user_id, user_email, action, entity_type, entity_id, details, ip_address)
  VALUES (_org_id, _user_id, _user_email, _action, _entity_type, _entity_id, _details, _ip_address);
END;
$$;

-- 4. Generic audit trigger function
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

  -- Try to get org_id from the record
  IF TG_OP = 'DELETE' THEN
    _org_id := CASE
      WHEN TG_TABLE_NAME IN ('agent_projects','campaigns','dial_lists','inbound_numbers','org_invitations') THEN (OLD).org_id
      ELSE NULL
    END;
  ELSE
    _org_id := CASE
      WHEN TG_TABLE_NAME IN ('agent_projects','campaigns','dial_lists','inbound_numbers','org_invitations') THEN (NEW).org_id
      ELSE NULL
    END;
  END IF;

  -- For agent_specs, get org_id via agent_projects
  IF TG_TABLE_NAME = 'agent_specs' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT ap.org_id INTO _org_id FROM agent_projects ap WHERE ap.id = OLD.project_id;
    ELSE
      SELECT ap.org_id INTO _org_id FROM agent_projects ap WHERE ap.id = NEW.project_id;
    END IF;
  END IF;

  -- Try to get user from auth context
  _user_id := auth.uid();

  PERFORM log_audit_event(_org_id, _user_id, NULL, _action, _entity_type, _entity_id, _details, NULL);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Attach triggers to key tables
CREATE TRIGGER audit_agent_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_agent_specs
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_specs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_dial_lists
  AFTER INSERT OR UPDATE OR DELETE ON public.dial_lists
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_inbound_numbers
  AFTER INSERT OR UPDATE OR DELETE ON public.inbound_numbers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_org_invitations
  AFTER INSERT OR UPDATE OR DELETE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
