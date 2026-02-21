

# Fix Transfer Agent Issue -- Patch the Agent, Not Just the LLM

## Problem
Two issues discovered:

1. **Transfer agent still broken**: All previous fix attempts patched the LLM (`is_transfer_llm: false`) but Retell has a **separate** `is_transfer_agent` flag on the agent object itself. This agent-level flag is what blocks outbound calls, and it remains `true`.

2. **Agent not visible in Retell UI**: The agent has `is_published: false`. This may cause it to be hidden in some Retell dashboard views.

## Solution

### 1. Fix `manage-retell-agent` -- `switch_to_outbound` action
Update the existing `switch_to_outbound` action to ALSO patch the agent with `is_transfer_agent: false` (not just the LLM). This is a one-line addition to the existing PATCH call in the function.

### 2. Fix `run-test-run` -- pre-flight auto-switch
Update the pre-flight check to patch the **agent** directly with `PATCH /update-agent/{agent_id}` setting `{ is_transfer_agent: false }`, instead of (or in addition to) patching the LLM.

### 3. No UI changes needed

## Technical Details

### manage-retell-agent changes
In the `switch_to_outbound` action, after patching the LLM, also patch the agent:
```text
PATCH /update-agent/{agent_id}  with { is_transfer_agent: false }
```

### run-test-run pre-flight changes
Replace the current LLM patch with an agent-level patch:
```text
if (agentCheckData.is_transfer_agent === true) {
  PATCH /update-agent/{agent_id} with { is_transfer_agent: false }
  // Also patch LLM if llm_id exists (keep existing logic)
  wait 2 seconds for propagation
}
```

## Files Changed
- **Modified**: `supabase/functions/manage-retell-agent/index.ts` -- add agent-level patch in `switch_to_outbound`
- **Modified**: `supabase/functions/run-test-run/index.ts` -- add agent-level patch in pre-flight check

