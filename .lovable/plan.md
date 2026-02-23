

# Fix Cost Audits: Backfill Missing Cost Data and Prevent Future Gaps

## Problem
Out of 131 calls in the database, only 1 has `cost_estimate_usd` populated. This is because:
1. The webhook's **test lab flow** returns early (line 358) without ever calling the `trackCallCost` function
2. 130 historical calls were made before cost tracking was fully wired, so they have no cost data

## Solution

### 1. Fix the webhook to track costs for test lab calls
**File:** `supabase/functions/receive-retell-webhook/index.ts`

Add a `trackCallCost` call inside the test lab flow, right before the early return at line 355. This ensures all future test lab calls also get their costs recorded.

### 2. Create a backfill edge function
**File:** `supabase/functions/backfill-call-costs/index.ts` (new)

A one-time-use edge function that:
- Queries all calls where `cost_estimate_usd IS NULL` and `retell_call_id IS NOT NULL`
- For each call, fetches the cost from Retell's `GET /v2/get-call/{call_id}` endpoint
- Updates `cost_estimate_usd` on the call record
- Also inserts the corresponding `credit_transactions` entry and adjusts `credits_balance`
- Processes in batches to avoid timeouts

### 3. Run the backfill
After deploying, invoke the backfill function once to populate costs for all 130 existing calls.

## Technical Details

**Webhook fix (receive-retell-webhook/index.ts):**
- Insert cost tracking call around line 345, before the test lab early return:
```
if (metadata.org_id && retellCallId) {
  const phoneLabel = metadata.phone || "test";
  await trackCallCost(supabase, metadata.org_id, retellCallId, duration, phoneLabel);
}
```

**Backfill function (backfill-call-costs/index.ts):**
- Fetches calls with `cost_estimate_usd IS NULL` and valid `retell_call_id`
- Loops through each, calling Retell API to get `combined_cost`
- Updates the call record and creates credit transaction
- Returns a summary of how many calls were updated

No database schema changes needed. No UI changes needed -- the existing Cost Audits page will automatically show all the data once costs are populated.

