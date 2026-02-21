

# Auto-Fix Transfer Agents Before Outbound Calls

## Problem
The "Switch to Outbound" button exists on the Edit Agent page, but when a user runs a test call from the University page, the Retell API rejects the call with "Transfer agents cannot be used for outbound calls." Users shouldn't have to remember to manually fix this first.

## Solution
Add a pre-flight check in the `run-test-run` edge function that detects transfer agents and automatically switches them to outbound before attempting the call.

## Changes

### 1. Update `run-test-run` edge function
In the Retell branch (line ~117), before making calls:
- Call `GET /get-agent/{retellAgentId}` to check if the agent is a transfer agent
- If `is_transfer_agent` is true, extract the `llm_id` from `response_engine` and call `PATCH /update-retell-llm/{llm_id}` with `{ is_transfer_llm: false }`
- Log the auto-fix and proceed with the call
- This reuses the same logic already in `manage-retell-agent`'s `switch_to_outbound` action

### 2. No UI changes needed
The fix happens transparently in the backend. The test call will just work.

## Technical Details

### Pre-flight check flow
```text
1. run-test-run receives request for Retell agent
2. GET https://api.retellai.com/get-agent/{agent_id}
3. If response.is_transfer_agent === true:
   a. Extract llm_id from response.response_engine.llm_id
   b. PATCH https://api.retellai.com/update-retell-llm/{llm_id} with { is_transfer_llm: false }
   c. Log "Auto-switched agent {id} from transfer to outbound"
4. Proceed with create-phone-call as normal
```

## Files Changed
- **Modified**: `supabase/functions/run-test-run/index.ts` -- add transfer agent pre-flight check in the Retell branch

