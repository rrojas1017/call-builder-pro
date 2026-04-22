ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cost_multiplier numeric NOT NULL DEFAULT 1.6,
  ADD COLUMN IF NOT EXISTS monthly_base_fee_usd numeric NOT NULL DEFAULT 0;