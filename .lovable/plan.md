

# Add Missing Inbound Number and Re-process Call

## What Happened
The phone number `+19482650259` was provisioned in Retell but never registered in the `inbound_numbers` table, so when the webhook received the call it couldn't resolve the org/project and dropped it.

## Steps

### 1. Insert the missing number into `inbound_numbers`
Add `+19482650259` linked to:
- **org_id**: `3b652df6-a5a3-4bf1-b2de-e66c12a63974`
- **project_id**: `5d72204a-caa3-4a41-a980-bfb6d413060b` (ACA Inbound Qualifier)
- **area_code**: `948`
- **label**: `ACA Inbound`
- **monthly_cost_usd**: `2`
- **status**: `active`

### 2. Re-process the missed call
Fetch the call details from the Retell API using call ID `call_eba6b5ce9aa207dce8a3be4912a`, then manually create the call record in the `calls` table with:
- `direction: "inbound"`
- `inbound_number_id` set to the newly inserted number
- Transcript, recording, duration, and cost from Retell
- Trigger evaluation if transcript is available

This will be done by invoking the `receive-retell-webhook` edge function with a simulated `call_analyzed` event containing the Retell call data, or by directly inserting the call record and invoking `evaluate-call`.

### 3. Update Retell phone number metadata
Ensure the number has the correct `nickname` (`org_id::project_id`) set on the Retell side so future inbound calls are automatically detected.

## Files Changed

| File | Change |
|------|--------|
| Database | INSERT into `inbound_numbers` for +19482650259 |
| `manage-inbound-numbers` | Invoke "assign" action to set metadata on Retell side |
| Edge function call | Fetch call from Retell API and create call record + evaluation |

