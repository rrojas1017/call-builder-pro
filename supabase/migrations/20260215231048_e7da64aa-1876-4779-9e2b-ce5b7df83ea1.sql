
-- Add whatsapp_number to agent_specs
ALTER TABLE public.agent_specs ADD COLUMN IF NOT EXISTS whatsapp_number text;

-- Create whatsapp_conversations table
CREATE TABLE public.whatsapp_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  project_id UUID NOT NULL REFERENCES public.agent_projects(id),
  wa_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create whatsapp_messages table
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  twilio_message_sid TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for whatsapp_conversations
CREATE POLICY "Users can view their org conversations"
  ON public.whatsapp_conversations FOR SELECT
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Service role can insert conversations"
  ON public.whatsapp_conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update conversations"
  ON public.whatsapp_conversations FOR UPDATE
  USING (true);

-- RLS policies for whatsapp_messages
CREATE POLICY "Users can view messages in their org conversations"
  ON public.whatsapp_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.id = conversation_id AND wc.org_id = public.get_user_org_id(auth.uid())
  ));

CREATE POLICY "Service role can insert messages"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (true);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

-- Add updated_at trigger for conversations
CREATE TRIGGER update_whatsapp_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_whatsapp_conversations_org_id ON public.whatsapp_conversations(org_id);
CREATE INDEX idx_whatsapp_conversations_wa_number ON public.whatsapp_conversations(wa_number);
CREATE INDEX idx_whatsapp_conversations_project_id ON public.whatsapp_conversations(project_id);
CREATE INDEX idx_whatsapp_messages_conversation_id ON public.whatsapp_messages(conversation_id);
