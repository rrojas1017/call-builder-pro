

# Fix: Bind Retell Agent to Outbound Phone Number Before Batch Dialing

## Problem
Retell's batch call API requires the `from_number` to have an `outbound_agent_id` configured on the phone number itself. Currently, `start-campaign` syncs the agent prompt and settings but never links the agent to the outbound phone number, causing every batch call to fail with "No outbound agent id set up for phone number."

## Solution
Add a pre-flight step in `start-campaign` that binds the Retell agent to the selected outbound phone number via Retell's `update-phone-number` API before setting the campaign to running.

## Changes

**File: `supabase/functions/start-campaign/index.ts`**

After the existing agent sync block (around where it syncs voice/speed/etc.) and before setting campaign to "running", add:

1. Determine the `fromNumber` using the same logic as `tick-campaign` (check `spec.from_number`, then fall back to trusted outbound numbers).
2. Call Retell's `PATCH /update-phone-number/{phone_number}` with `{ outbound_agent_id: retellAgentId }` to bind the agent to that number.
3. Log success/failure. If the binding fails, return a clear error to the user instead of proceeding.

This is a single addition (~15 lines) to `start-campaign/index.ts`. No other files need changes.

## Technical Detail
- Retell API endpoint: `PATCH https://api.retellai.com/update-phone-number/{phone_number}` with body `{ "outbound_agent_id": "<agent_id>" }`
- The phone number ID in Retell's API is the E.164 number itself (e.g., `+17864340190`)
- This must happen before `tick-campaign` is invoked, so the batch call succeeds on first tick

