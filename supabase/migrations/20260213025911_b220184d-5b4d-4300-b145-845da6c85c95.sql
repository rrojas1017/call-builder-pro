
-- Fix overly permissive ALL policy - replace with scoped policies
DROP POLICY "Service role full access" ON public.global_human_behaviors;

-- Only service role can insert/update/delete (edge functions)
CREATE POLICY "Service role can manage behaviors"
ON public.global_human_behaviors
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
