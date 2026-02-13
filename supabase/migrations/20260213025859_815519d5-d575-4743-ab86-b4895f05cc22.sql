
-- Create global human behaviors table (no project_id -- truly global)
CREATE TABLE public.global_human_behaviors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_agent_id UUID REFERENCES public.agent_projects(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (service role only -- edge functions access this)
ALTER TABLE public.global_human_behaviors ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role key)
CREATE POLICY "Service role full access"
ON public.global_human_behaviors
FOR ALL
USING (true)
WITH CHECK (true);

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read global behaviors"
ON public.global_human_behaviors
FOR SELECT
TO authenticated
USING (true);

-- Seed initial behaviors from hardcoded conversation tips
INSERT INTO public.global_human_behaviors (content, source_type) VALUES
('Use natural filler words occasionally like "yeah", "sure", "right" to sound more human', 'manual'),
('Mirror the caller''s energy level - if they''re enthusiastic, match it; if they''re reserved, be calm', 'manual'),
('Use the caller''s name naturally throughout the conversation, especially after they share personal info', 'manual'),
('Add brief acknowledgments before transitioning: "That makes sense" or "I appreciate you sharing that"', 'manual'),
('When asking about income, normalize it: "Just a rough estimate is fine" to reduce discomfort', 'manual'),
('Use contractions naturally (I''m, you''re, we''ll) instead of formal speech', 'manual'),
('Pause briefly after the caller answers before moving to the next question - don''t rapid-fire', 'manual'),
('If the caller goes off-topic briefly, acknowledge what they said before steering back', 'manual');
