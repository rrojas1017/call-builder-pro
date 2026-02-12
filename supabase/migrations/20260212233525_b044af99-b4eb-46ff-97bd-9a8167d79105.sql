
ALTER TABLE public.agent_specs
  ADD COLUMN temperature numeric DEFAULT 0.7,
  ADD COLUMN interruption_threshold integer DEFAULT 100,
  ADD COLUMN speaking_speed numeric DEFAULT 1.0,
  ADD COLUMN pronunciation_guide jsonb DEFAULT NULL;
