

# CRM: Multi-Campaign Type Organization

## Problem
The CRM currently has hardcoded ACA-specific fields (age, household_size, income, coverage_type) in both the table schema and UI. When campaigns span different verticals (ACA, Medicare, Loans, Credit Repair, Spanish-language campaigns, etc.), the fixed columns become irrelevant and the UI shows empty fields everywhere.

## Solution: Campaign-Aware Dynamic CRM

### 1. Add a Campaign Filter to the CRM Page
- Add a campaign dropdown filter alongside the existing State and Qualification filters
- When a campaign is selected, the table and detail panel dynamically show only the fields relevant to that campaign's records
- "All Campaigns" shows the universal columns (name, phone, state, qualified, calls, outcome)

### 2. Leverage `custom_fields` as the Primary Data Store
The existing `custom_fields` JSONB column already captures ALL extracted data from calls. Instead of relying on the hardcoded ACA columns, the system will:
- Continue storing common fields (name, phone, state, email, consent, qualified) in their dedicated columns
- Store ALL vertical-specific fields in `custom_fields` (e.g., `{"medicare_id": "...", "part_preference": "A"}` or `{"credit_score": "720", "loan_amount": "25000"}`)
- The detail panel already renders `custom_fields` dynamically -- this just needs better prominence

### 3. Smart Column Display
When filtering by a specific campaign, the table will:
- Scan the `custom_fields` of the filtered records to discover which fields exist
- Display those as additional columns in the table (up to a reasonable limit)
- This means an ACA campaign view shows "Age, Income, Coverage Type" columns while a Loan campaign shows "Credit Score, Loan Amount" columns -- automatically

### 4. Campaign Tags on Records
- Store ALL campaign IDs that touched a record (not just the last one) in a new `campaign_ids` array column
- Display campaign tags/badges on each record so you can see which campaigns have interacted with a contact
- This enables filtering: "Show me everyone touched by my Spanish Medicare campaign"

## What Changes

### Database
- Add `campaign_ids uuid[]` column to `crm_records` to track all campaigns that touched the record (not just last)
- Update the `upsert_crm_record` function to append campaign IDs to the array instead of overwriting

### Webhook (receive-retell-webhook)
- Update the CRM upsert call to pass the campaign_id for array accumulation
- No changes to how `extracted_data` feeds into `custom_fields` -- this already works

### CRM Page UI
- Add campaign filter dropdown (populated from campaigns table)
- When a campaign is selected, dynamically extract unique keys from `custom_fields` of the filtered records and display them as extra table columns
- Show campaign badges on each record row
- In the detail panel, group "Gathered Information" by campaign context
- Rename the hardcoded ACA section to "Standard Fields" and keep it as a fallback display

### CSV Export
- When filtered by campaign, include the dynamic `custom_fields` columns in the export
- Column headers adapt based on the filtered dataset

## Technical Details

### Migration
```text
ALTER TABLE crm_records ADD COLUMN campaign_ids uuid[] NOT NULL DEFAULT '{}';
-- Backfill from last_campaign_id
UPDATE crm_records SET campaign_ids = ARRAY[last_campaign_id] WHERE last_campaign_id IS NOT NULL;
```

### Updated upsert function (pseudo)
```text
-- In the ON CONFLICT DO UPDATE:
campaign_ids = array(SELECT DISTINCT unnest(crm_records.campaign_ids || ARRAY[_campaign_id]))
```

### Dynamic column discovery (frontend)
```text
// After filtering records by campaign:
const dynamicKeys = new Set();
filteredRecords.forEach(r => {
  if (r.custom_fields) Object.keys(r.custom_fields).forEach(k => dynamicKeys.add(k));
});
// Render these as additional table columns
```

### Files to modify
- New migration for `campaign_ids` column + updated upsert function
- `supabase/functions/receive-retell-webhook/index.ts` -- pass campaign_id for array accumulation
- `src/pages/CRMPage.tsx` -- add campaign filter, dynamic columns, campaign badges

## Implementation Order
1. Database migration (add column, update function)
2. Update webhook to accumulate campaign IDs
3. Update CRM page with campaign filter and dynamic columns
4. Deploy edge function
