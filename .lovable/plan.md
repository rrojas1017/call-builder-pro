

# CRM Records: Centralized Contact Repository

## Overview
Create a new "CRM" section that aggregates all gathered information from calls into a unified, per-contact repository. Each record represents a unique person (identified by phone number) with their accumulated data from all interactions across campaigns and test runs.

## What You Get
- A new **CRM Records** page accessible from the sidebar under a new "CRM" section
- Each record shows: name, phone, state, gathered fields (age, income, household size, coverage type, etc.), qualification status, consent, email if captured
- Historical timeline per record: every call attempt, campaign, date, outcome, duration
- Data is automatically populated from existing call records -- no manual entry needed
- Multi-tenant isolation: each organization sees only their own records
- Super admins can view all organizations' CRM data

## Database Design

### New table: `crm_records`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| org_id | uuid (NOT NULL) | Organization isolation |
| phone | text (NOT NULL) | Primary identifier, unique per org |
| name | text | Best-known name from calls |
| email | text | Captured email if any |
| state | text | Geographic state |
| zip_code | text | Zip if captured |
| age | text | Age or age range |
| household_size | text | Household size |
| income_est_annual | text | Estimated income |
| coverage_type | text | Coverage type |
| consent | boolean | Whether consent was given |
| qualified | boolean | Whether contact was qualified |
| transferred | boolean | Whether transfer completed |
| custom_fields | jsonb | Any additional extracted fields |
| first_contacted_at | timestamptz | First call date |
| last_contacted_at | timestamptz | Most recent call date |
| total_calls | integer | Count of all call interactions |
| last_campaign_id | uuid | Most recent campaign |
| last_outcome | text | Most recent call outcome |
| source | text | How the record was created (e.g., "call_webhook") |
| created_at | timestamptz | Record creation |
| updated_at | timestamptz | Last update |

**Unique constraint**: `(org_id, phone)` -- one record per phone per org.

### RLS Policies
- Org members can SELECT their own org's records
- Admins can manage (ALL) their org's records
- Super admins can SELECT all records across orgs

## Backend Changes

### Update `receive-retell-webhook` edge function
After processing a call (both campaign and test lab flows), upsert a CRM record:
1. Extract structured fields from `extracted_data` (name, state, age, income, etc.)
2. Upsert into `crm_records` matching on `(org_id, phone)`
3. Increment `total_calls`, update `last_contacted_at`, merge any new fields

This ensures every completed call automatically feeds the CRM.

## Frontend Changes

### New page: `src/pages/CRMPage.tsx`
- Table view with sortable columns: Name, Phone, State, Qualified, Last Contact, Total Calls, Last Campaign, Last Outcome
- Search by name or phone
- Filters: qualified/disqualified/all, state, campaign, date range
- Click a row to expand a detail panel showing:
  - All gathered fields
  - Call history timeline (linked from `calls` table)
  - Campaign associations
- CSV export button
- Super admin view: org name column + org filter dropdown

### Sidebar update
Add "CRM" item under the MONITOR section in `useSidebarConfig.ts`.

### Route
Add `/crm` route in `App.tsx` inside the protected layout.

## Technical Details

### Migration SQL
- Create `crm_records` table with unique constraint on `(org_id, phone)`
- Enable RLS with org-scoped policies
- Add indexes on `org_id`, `phone`, `qualified`, `last_contacted_at`

### Webhook upsert logic (in `receive-retell-webhook`)
```
-- Pseudocode for the upsert
INSERT INTO crm_records (org_id, phone, name, state, ...)
VALUES (metadata.org_id, phone, extracted.caller_name, ...)
ON CONFLICT (org_id, phone) DO UPDATE SET
  name = COALESCE(EXCLUDED.name, crm_records.name),
  last_contacted_at = now(),
  total_calls = crm_records.total_calls + 1,
  last_outcome = EXCLUDED.last_outcome,
  qualified = COALESCE(EXCLUDED.qualified, crm_records.qualified),
  ...
```

### CRM page queries
- Main list: `SELECT * FROM crm_records WHERE org_id = ? ORDER BY last_contacted_at DESC`
- Call history for a record: `SELECT * FROM calls WHERE org_id = ? AND contact_id IN (...) OR retell_call_id IN (...) ORDER BY started_at DESC`
- For super admin: remove org filter, join with `organizations` for org name

## Implementation Order
1. Database migration (create table + RLS + indexes)
2. Update `receive-retell-webhook` to upsert CRM records
3. Create `CRMPage.tsx` with table view and detail panel
4. Add route and sidebar entry
5. Deploy the updated edge function
6. Backfill existing call data into CRM records (one-time script via edge function)

