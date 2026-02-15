
-- Create storage bucket for agent knowledge source files
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent_knowledge_sources', 'agent_knowledge_sources', false);

-- RLS: org members can upload files for their agents
CREATE POLICY "Org members can upload knowledge sources"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'agent_knowledge_sources'
  AND auth.uid() IS NOT NULL
);

-- RLS: org members can read their uploaded files
CREATE POLICY "Org members can read knowledge sources"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'agent_knowledge_sources'
  AND auth.uid() IS NOT NULL
);

-- RLS: org members can delete their uploaded files
CREATE POLICY "Org members can delete knowledge sources"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'agent_knowledge_sources'
  AND auth.uid() IS NOT NULL
);
