

# Add "Switch to Outbound" Button for Transfer Agents

## Problem
When a Retell agent is configured as a "transfer agent," it can't make outbound calls. Currently, users see a warning but have no way to fix it without leaving the app.

## Solution
Add a "Switch to Outbound" button directly in the transfer agent warning banner. Clicking it will call the Retell API to set `is_transfer_llm: false` on the agent's LLM, then refresh the agent config to confirm the change.

## Changes

### 1. Update the backend function (`manage-retell-agent`)
Add a new `"switch_to_outbound"` action that:
- Takes the `agent_id`, fetches the agent to get its `llm_id` from `response_engine`
- Calls `PATCH https://api.retellai.com/update-retell-llm/{llm_id}` with `{ is_transfer_llm: false }`
- Returns the updated agent config

### 2. Update the hook (`useRetellAgent`)
Add a `switchToOutbound(agentId)` function that invokes the new action and refreshes the local state.

### 3. Update the UI component (`RetellAgentManager`)
- Add a "Switch to Outbound" button inside the yellow transfer agent warning banner
- On click, calls `switchToOutbound`, shows a toast on success, and the warning disappears as the agent is no longer a transfer agent

## Technical Details

### API call flow
```text
1. User clicks "Switch to Outbound"
2. Edge function receives { action: "switch_to_outbound", agent_id: "agent_xxx" }
3. Function calls GET /get-agent/{agent_id} to get the llm_id
4. Function calls PATCH /update-retell-llm/{llm_id} with { is_transfer_llm: false }
5. Function calls GET /get-agent/{agent_id} again and returns refreshed config
6. UI updates, transfer warning disappears
```

## Files Changed
- **Modified**: `supabase/functions/manage-retell-agent/index.ts` -- add `switch_to_outbound` action
- **Modified**: `src/hooks/useRetellAgent.ts` -- add `switchToOutbound` method
- **Modified**: `src/components/RetellAgentManager.tsx` -- add button in warning banner
