

# Fix: Add Delay After Transfer Agent Auto-Switch

## Problem
The pre-flight auto-fix works -- logs confirm `"Auto-switched agent ... from transfer to outbound"` -- but the outbound call is made immediately afterward, before Retell's backend has propagated the change. The `create-phone-call` endpoint still sees the agent as a transfer agent and rejects it.

## Solution
Add a 2-second delay after the successful auto-switch to allow Retell's API to propagate the LLM configuration change before attempting the outbound call.

## Changes

### 1. Update `run-test-run` edge function
After the successful `PATCH` to `update-retell-llm`, add a 2-second `await` before proceeding to the call loop. This gives Retell time to update the agent's cached state.

```text
1. Pre-flight detects transfer agent
2. PATCH update-retell-llm -> success
3. NEW: await 2-second delay
4. Proceed with create-phone-call
```

## Technical Details

The change is a single line addition after the successful patch log:
```typescript
if (patchRes.ok) {
  console.log(`Auto-switched agent ${retellAgentId} from transfer to outbound`);
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for propagation
}
```

## Files Changed
- **Modified**: `supabase/functions/run-test-run/index.ts` -- add 2-second delay after successful transfer agent auto-switch

