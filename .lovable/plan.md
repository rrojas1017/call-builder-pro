

# Fix: Retell Test Calls Failing Due to Missing `from_number`

## Problem
When running a test call with the Retell (Append) provider, the API returns: `request/body must have required property 'from_number'`. This happens because no outbound number is configured and the `from_number` field is silently omitted from the API payload.

## Solution

### 1. Add validation in `run-test-run` edge function
Before attempting the Retell API call, check that a `from_number` is available. If not, return a clear, user-friendly error message instead of letting the Retell API return a cryptic one.

### 2. Add validation in `tick-campaign` edge function
Apply the same guard for campaign calls using Retell to prevent the same issue during live campaigns.

### 3. Improve the Create/Edit Agent UI
When the user selects "Append" (Retell) as the voice provider, show a warning or required field if no trusted outbound numbers exist for the organization. This prevents users from getting to the test stage only to hit this error.

## Technical Details

### Edge function changes (`run-test-run/index.ts`)
- After line 144 (end of `from_number` resolution), add a check:
  - If `retellPayload.from_number` is still undefined, mark the contact as "failed" with error message: "No outbound number available. Please add a trusted phone number in Settings > Phone Numbers, or set a From Number on your agent."
  - Skip the API call for that contact.

### Edge function changes (`tick-campaign/index.ts`)
- Apply the same `from_number` validation in the Retell branch of the campaign tick function.

### UI changes (`CreateAgentPage.tsx` / `EditAgentPage.tsx`)
- When provider is "retell"/"append", query the `outbound_numbers` table for trusted numbers.
- If none exist, display an inline warning: "Retell requires an outbound phone number. Add one in Settings > Phone Numbers."
- Optionally add a direct "From Number" input field on the agent form for Retell agents.

