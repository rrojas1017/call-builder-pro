
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'analyst', 'viewer');

-- Create organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'admin',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper to get user org
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = _user_id
$$;

-- Auto-create profile + org on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
BEGIN
  INSERT INTO public.organizations (name) VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', 'My Organization') || '''s Org')
  RETURNING id INTO new_org_id;
  
  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (NEW.id, new_org_id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Agent projects
CREATE TABLE public.agent_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  source_text text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_projects ENABLE ROW LEVEL SECURITY;

-- Agent specs
CREATE TABLE public.agent_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  use_case text NOT NULL DEFAULT 'aca_prequal',
  tone_style text,
  disclosure_text text,
  consent_required boolean NOT NULL DEFAULT true,
  qualification_rules jsonb DEFAULT '{}',
  disqualification_rules jsonb DEFAULT '{}',
  must_collect_fields jsonb DEFAULT '["consent","state","age","household_size","income_est_annual","coverage_type"]',
  transfer_phone_number text,
  business_hours jsonb DEFAULT '{"timezone":"America/New_York","start":"09:00","end":"17:00","days":["mon","tue","wed","thu","fri"]}',
  retry_policy jsonb DEFAULT '{"max_attempts":3,"spacing_minutes":60}',
  language text NOT NULL DEFAULT 'en',
  from_number text,
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_specs ENABLE ROW LEVEL SECURITY;

-- Wizard questions
CREATE TABLE public.wizard_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wizard_questions ENABLE ROW LEVEL SECURITY;

-- Campaigns
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed')),
  max_concurrent_calls int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Contacts
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','calling','completed','failed','no_answer','voicemail','busy')),
  bland_call_id text,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Calls
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  bland_call_id text UNIQUE,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  outcome text,
  transcript text,
  summary jsonb,
  extracted_data jsonb,
  cost_estimate_usd numeric,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Evaluations
CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE REFERENCES public.calls(id) ON DELETE CASCADE,
  rubric jsonb,
  overall_score numeric,
  issues jsonb,
  recommended_fixes jsonb,
  approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Improvements
CREATE TABLE public.improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  from_version int NOT NULL,
  to_version int NOT NULL,
  change_summary text,
  patch jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.improvements ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES

-- Organizations
CREATE POLICY "Users can view own org" ON public.organizations
  FOR SELECT USING (id = public.get_user_org_id(auth.uid()));

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

-- Agent projects
CREATE POLICY "Org members can view projects" ON public.agent_projects
  FOR SELECT USING (org_id = public.get_user_org_id(auth.uid()));
CREATE POLICY "Admins can create projects" ON public.agent_projects
  FOR INSERT WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );
CREATE POLICY "Admins can update projects" ON public.agent_projects
  FOR UPDATE USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );
CREATE POLICY "Admins can delete projects" ON public.agent_projects
  FOR DELETE USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- Agent specs
CREATE POLICY "Org members can view specs" ON public.agent_specs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.agent_projects ap WHERE ap.id = project_id AND ap.org_id = public.get_user_org_id(auth.uid()))
  );
CREATE POLICY "Admins can manage specs" ON public.agent_specs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.agent_projects ap WHERE ap.id = project_id AND ap.org_id = public.get_user_org_id(auth.uid()))
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- Wizard questions
CREATE POLICY "Org members can view wizard questions" ON public.wizard_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.agent_projects ap WHERE ap.id = project_id AND ap.org_id = public.get_user_org_id(auth.uid()))
  );
CREATE POLICY "Admins can manage wizard questions" ON public.wizard_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.agent_projects ap WHERE ap.id = project_id AND ap.org_id = public.get_user_org_id(auth.uid()))
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- Campaigns
CREATE POLICY "Org members can view campaigns" ON public.campaigns
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.agent_projects ap WHERE ap.id = project_id AND ap.org_id = public.get_user_org_id(auth.uid()))
  );
CREATE POLICY "Admins can manage campaigns" ON public.campaigns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.agent_projects ap WHERE ap.id = project_id AND ap.org_id = public.get_user_org_id(auth.uid()))
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- Contacts
CREATE POLICY "Org members can view contacts" ON public.contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.agent_projects ap ON ap.id = c.project_id
      WHERE c.id = campaign_id AND ap.org_id = public.get_user_org_id(auth.uid())
    )
  );
CREATE POLICY "Admins can manage contacts" ON public.contacts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      JOIN public.agent_projects ap ON ap.id = c.project_id
      WHERE c.id = campaign_id AND ap.org_id = public.get_user_org_id(auth.uid())
    )
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- Calls
CREATE POLICY "Org members can view calls" ON public.calls
  FOR SELECT USING (org_id = public.get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage calls" ON public.calls
  FOR ALL USING (
    org_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- Evaluations
CREATE POLICY "Org members can view evaluations" ON public.evaluations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_id AND c.org_id = public.get_user_org_id(auth.uid()))
  );
CREATE POLICY "Admins can manage evaluations" ON public.evaluations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_id AND c.org_id = public.get_user_org_id(auth.uid()))
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- Improvements
CREATE POLICY "Org members can view improvements" ON public.improvements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.agent_projects ap WHERE ap.id = project_id AND ap.org_id = public.get_user_org_id(auth.uid()))
  );

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_agent_projects_updated_at BEFORE UPDATE ON public.agent_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_specs_updated_at BEFORE UPDATE ON public.agent_specs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
