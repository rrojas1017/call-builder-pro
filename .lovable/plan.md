

# Add Diagnostic Logging to Bulk Calling Pipeline

## Goal
Add detailed logging to `tick-campaign` and `start-campaign` so you can trace exactly what happens (or fails) when running your first Retell bulk campaign.

## Retell Webhook Setup (Manual Step)
In your Retell dashboard, set the webhook URL for your agents to:
```text
https://kmwaqmowstrhwmevwweg.supabase.co/functions/v1/receive-retell-webhook
```
Without this, calls will complete but your system won't know about it.

## Changes

### 1. `supabase/functions/start-campaign/index.ts`
- Log the campaign_id being started
- Log the tick-campaign invocation result (status code) instead of fire-and-forget
- Catch and log errors from the tick call

### 2. `supabase/functions/tick-campaign/index.ts`
- Add a top-level log: campaign_id, org_id, agent_id
- Log credit balance check result
- Log number of trusted outbound numbers found
- Log the from_number selected
- Log the exact batch payload being sent to Retell (tasks count, agent_id, from_number)
- Log the full Retell response body on both success and failure
- Log contact IDs being marked as "calling"
- Add timing: log total execution time at the end

### 3. `supabase/functions/receive-retell-webhook/index.ts`
- Log the full incoming webhook payload (already partially done, increase to 1000 chars)
- Log the mapped contact status and outcome
- Log whether tick-campaign re-trigger fired successfully

## Technical Details
- All changes are console.log/console.error additions -- no logic changes
- Logs will be visible in the backend function logs viewer
- No database or schema changes needed
