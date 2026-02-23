
ALTER TABLE public.agent_knowledge ADD COLUMN usage_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.agent_knowledge ADD COLUMN file_name text;
ALTER TABLE public.agent_knowledge ADD COLUMN insights_preview jsonb;
