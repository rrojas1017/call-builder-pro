
-- Add missing columns to agent_specs
ALTER TABLE public.agent_specs
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'outbound' CHECK (mode IN ('outbound', 'inbound', 'hybrid')),
  ADD COLUMN IF NOT EXISTS opening_line text,
  ADD COLUMN IF NOT EXISTS disclosure_required boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS success_definition text,
  ADD COLUMN IF NOT EXISTS transfer_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_rules jsonb,
  ADD COLUMN IF NOT EXISTS business_rules jsonb;

-- Add rationale column to wizard_questions
ALTER TABLE public.wizard_questions
  ADD COLUMN IF NOT EXISTS rationale text;

-- Add evaluation column to calls
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS evaluation jsonb;
