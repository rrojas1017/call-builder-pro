
-- Add Retell columns to agent_specs (additive only)
ALTER TABLE public.agent_specs
  ADD COLUMN IF NOT EXISTS voice_provider text NOT NULL DEFAULT 'bland',
  ADD COLUMN IF NOT EXISTS retell_agent_id text;

-- Add Retell columns to calls (additive only)
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS retell_call_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS voice_provider text NOT NULL DEFAULT 'bland';

-- Add Retell column to test_run_contacts
ALTER TABLE public.test_run_contacts
  ADD COLUMN IF NOT EXISTS retell_call_id text;

-- Add Retell column to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS retell_batch_id text;
