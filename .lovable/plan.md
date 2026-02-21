

# Fix: Bulk Sync Retell Agents - response_engine Schema Error

## Problem
The `bulk-sync-retell-agents` edge function fails for all 8 agents with this Retell API error:

> `response_engine must have required property 'llm_id'... must match exactly one schema in oneOf`

The `response_engine: { type: "retell-llm" }` format is not accepted by Retell's API -- it requires either `llm_id`, `llm_websocket_url`, or `conversation_flow_id` to be present, OR the `response_engine` field should be omitted entirely to let Retell auto-create one.

## Root Cause
In the working `manage-retell-agent` function, when no `llm_id` is provided, the field is deleted from the object before sending. The `bulk-sync` function doesn't do this cleanup.

## Fix
In `supabase/functions/bulk-sync-retell-agents/index.ts`, remove the explicit `response_engine` field from the create body. Let Retell auto-create the LLM (which is what happens in the working function). The auto-created LLM ID is returned in the response and then used for prompt injection.

### Change Details

**File:** `supabase/functions/bulk-sync-retell-agents/index.ts`

Replace the `createBody` construction (around lines 55-65) to remove `response_engine`:

```typescript
const createBody: Record<string, unknown> = {
  agent_name: projectName,
  language: retellLang,
  webhook_url: webhookUrl,
  post_call_analysis_data: [
    { description: "Whether the lead was qualified", name: "qualified", type: "boolean" },
    { description: "Brief summary of the call", name: "call_summary", type: "string" },
  ],
};
if (spec.voice_id) createBody.voice_id = spec.voice_id;
```

The only change is removing the `response_engine: { type: "retell-llm" }` line. Retell will auto-create a retell-llm response engine and return the `llm_id` in the response, which is already being used for prompt injection on line 78+.

## Files
- **Modified**: `supabase/functions/bulk-sync-retell-agents/index.ts` (remove `response_engine` from create body)

## After Fix
Re-deploy the function, then click "Sync All Now" again to provision all 8 agents.

