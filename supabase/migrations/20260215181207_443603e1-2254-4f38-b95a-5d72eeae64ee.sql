ALTER TABLE public.training_audits ADD COLUMN unified_results jsonb;
ALTER TABLE public.training_audits ADD COLUMN cross_agent_context jsonb;