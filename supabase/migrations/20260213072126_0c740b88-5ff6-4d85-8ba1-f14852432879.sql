
-- Create sms_conversations table
CREATE TABLE public.sms_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  project_id UUID REFERENCES public.agent_projects(id),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view sms conversations"
  ON public.sms_conversations FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage sms conversations"
  ON public.sms_conversations FOR ALL
  USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')))
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

CREATE TRIGGER update_sms_conversations_updated_at
  BEFORE UPDATE ON public.sms_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create sms_messages table
CREATE TABLE public.sms_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'outbound',
  body TEXT NOT NULL,
  clicksend_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view sms messages"
  ON public.sms_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sms_conversations sc
    WHERE sc.id = sms_messages.conversation_id
    AND sc.org_id = get_user_org_id(auth.uid())
  ));

CREATE POLICY "Admins can manage sms messages"
  ON public.sms_messages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM sms_conversations sc
    WHERE sc.id = sms_messages.conversation_id
    AND sc.org_id = get_user_org_id(auth.uid())
  ) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sms_conversations sc
    WHERE sc.id = sms_messages.conversation_id
    AND sc.org_id = get_user_org_id(auth.uid())
  ) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

-- Add sms_enabled to agent_specs
ALTER TABLE public.agent_specs ADD COLUMN sms_enabled BOOLEAN NOT NULL DEFAULT false;
