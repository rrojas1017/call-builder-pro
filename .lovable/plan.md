

# Fix: Missing Extracted Data Fields (email, phone, age, income, etc.)

## Problem
The Retell agent's `post_call_analysis_data` configuration only defines 2 extraction fields:
- `qualified` (boolean)
- `call_summary` (string)

So when Retell sends the `call_analysis` data back via webhook, it only contains those 2 fields. All other data points (email, age, income, state, household_size, coverage_type, consent, caller_name, zip_code) are never extracted.

## Solution
Expand the `post_call_analysis_data` array in the Retell agent configuration to include all the fields the agent is instructed to collect. This needs to be updated in two places:

1. **`supabase/functions/manage-retell-agent/index.ts`** -- where new agents are created/updated
2. **`supabase/functions/bulk-sync-retell-agents/index.ts`** -- where agents are bulk-synced

Additionally, make the extraction fields dynamic based on the agent's `must_collect_fields` spec, so any custom fields are also extracted.

## Changes

### 1. `supabase/functions/manage-retell-agent/index.ts`
Replace the hardcoded 2-field `post_call_analysis_data` with a comprehensive list built from the agent spec's `must_collect_fields` plus standard fields:

```
post_call_analysis_data: [
  { name: "qualified", type: "boolean", description: "Whether the lead was qualified for transfer" },
  { name: "caller_name", type: "string", description: "The caller's full name" },
  { name: "email", type: "string", description: "The caller's email address" },
  { name: "state", type: "string", description: "The caller's US state" },
  { name: "zip_code", type: "string", description: "The caller's 5-digit zip code" },
  { name: "age", type: "string", description: "The caller's age" },
  { name: "household_size", type: "string", description: "Number of people in household" },
  { name: "income_est_annual", type: "string", description: "Estimated annual household income" },
  { name: "coverage_type", type: "string", description: "Current health coverage type" },
  { name: "consent", type: "boolean", description: "Whether the caller gave consent to continue" },
  { name: "transferred", type: "boolean", description: "Whether the call was transferred" },
  { name: "call_summary", type: "string", description: "Brief summary of the call" },
]
```

### 2. `supabase/functions/bulk-sync-retell-agents/index.ts`
Same expanded field list for consistency when agents are bulk-synced.

### 3. `supabase/functions/run-test-run/index.ts`
When creating a test call via Retell's `create-phone-call`, also pass `post_call_analysis_data` as an override if the API supports per-call analysis config. If not, the fix in manage-retell-agent will cover it since test runs use the same Retell agent.

## Impact
After this change, all new and updated Retell agents will extract the full set of collected fields. Existing agents will need a re-sync (the bulk-sync function or editing the agent) to pick up the new analysis fields. The webhook already handles all these fields in the CRM upsert logic -- it just wasn't receiving them from Retell.

## Technical Detail
- The Retell API's `post_call_analysis_data` tells Retell's LLM which structured fields to extract from the transcript after the call ends
- The extracted data arrives in the webhook payload as `call.call_analysis`
- The webhook code already maps these fields to `extracted_data` and stores them in `calls` + `test_run_contacts` + CRM

