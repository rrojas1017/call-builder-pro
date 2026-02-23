
INSERT INTO storage.buckets (id, name, public) VALUES ('agent_sources', 'agent_sources', false);

CREATE POLICY "Authenticated users can upload to agent_sources"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'agent_sources');

CREATE POLICY "Authenticated users can read from agent_sources"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'agent_sources');
