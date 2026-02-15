
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Service role can insert conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Service role can update conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Service role can insert messages" ON public.whatsapp_messages;

-- Scoped insert/update policies (only users in the org can insert/update)
CREATE POLICY "Users can insert conversations for their org"
  ON public.whatsapp_conversations FOR INSERT
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update their org conversations"
  ON public.whatsapp_conversations FOR UPDATE
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert messages in their org conversations"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.id = conversation_id AND wc.org_id = public.get_user_org_id(auth.uid())
  ));
