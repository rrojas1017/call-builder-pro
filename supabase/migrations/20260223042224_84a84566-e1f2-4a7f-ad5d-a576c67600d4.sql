
-- Add campaign_ids array to crm_records
ALTER TABLE crm_records ADD COLUMN campaign_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill from last_campaign_id
UPDATE crm_records SET campaign_ids = ARRAY[last_campaign_id] WHERE last_campaign_id IS NOT NULL;

-- Replace upsert_crm_record to accumulate campaign_ids
CREATE OR REPLACE FUNCTION public.upsert_crm_record(
  _org_id uuid, _phone text, _name text DEFAULT NULL, _email text DEFAULT NULL,
  _state text DEFAULT NULL, _age text DEFAULT NULL, _household_size text DEFAULT NULL,
  _income text DEFAULT NULL, _coverage_type text DEFAULT NULL, _consent boolean DEFAULT NULL,
  _qualified boolean DEFAULT NULL, _transferred boolean DEFAULT false,
  _custom_fields jsonb DEFAULT '{}'::jsonb, _campaign_id uuid DEFAULT NULL,
  _outcome text DEFAULT NULL, _now timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO crm_records (
    org_id, phone, name, email, state, age, household_size,
    income_est_annual, coverage_type, consent, qualified, transferred,
    custom_fields, first_contacted_at, last_contacted_at, total_calls,
    last_campaign_id, last_outcome, source, campaign_ids
  ) VALUES (
    _org_id, _phone, _name, _email, _state, _age, _household_size,
    _income, _coverage_type, _consent, _qualified, _transferred,
    _custom_fields, _now, _now, 1,
    _campaign_id, _outcome, 'call_webhook',
    CASE WHEN _campaign_id IS NOT NULL THEN ARRAY[_campaign_id] ELSE '{}' END
  )
  ON CONFLICT (org_id, phone) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, crm_records.name),
    email = COALESCE(EXCLUDED.email, crm_records.email),
    state = COALESCE(EXCLUDED.state, crm_records.state),
    age = COALESCE(EXCLUDED.age, crm_records.age),
    household_size = COALESCE(EXCLUDED.household_size, crm_records.household_size),
    income_est_annual = COALESCE(EXCLUDED.income_est_annual, crm_records.income_est_annual),
    coverage_type = COALESCE(EXCLUDED.coverage_type, crm_records.coverage_type),
    consent = COALESCE(EXCLUDED.consent, crm_records.consent),
    qualified = COALESCE(EXCLUDED.qualified, crm_records.qualified),
    transferred = CASE WHEN EXCLUDED.transferred THEN true ELSE crm_records.transferred END,
    custom_fields = crm_records.custom_fields || EXCLUDED.custom_fields,
    last_contacted_at = _now,
    total_calls = crm_records.total_calls + 1,
    last_campaign_id = COALESCE(EXCLUDED.last_campaign_id, crm_records.last_campaign_id),
    last_outcome = COALESCE(EXCLUDED.last_outcome, crm_records.last_outcome),
    updated_at = _now,
    campaign_ids = CASE 
      WHEN _campaign_id IS NOT NULL AND NOT (crm_records.campaign_ids @> ARRAY[_campaign_id])
      THEN crm_records.campaign_ids || ARRAY[_campaign_id]
      ELSE crm_records.campaign_ids
    END;
END;
$$;
