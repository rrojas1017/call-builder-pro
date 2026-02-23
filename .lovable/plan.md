

# Fix: Transfer Call Tool Not Being Synced to Retell LLM

## Problem
The agent's `transfer_call` tool is only configured when the agent is **first created** (in `manage-retell-agent`). However, both `run-test-run` and `tick-campaign` patch the LLM's `general_prompt` and `begin_message` before each call -- but they never sync the `general_tools` array. This means if the LLM's tools were lost, overwritten, or never included the `transfer_call` tool, the agent has no mechanism to transfer calls even though:
- `transfer_required = true` in the spec
- `transfer_phone_number = +13054332275` is configured
- The prompt text says "TRANSFER: If qualified... transfer to +13054332275"

The prompt **tells** the agent to transfer, but the agent doesn't have the `transfer_call` **tool** available to actually do it.

## Changes

### 1. `supabase/functions/tick-campaign/index.ts` -- Sync `general_tools` during LLM injection
In the LLM patch section (around line 236), build the `general_tools` array from the spec and include it in the PATCH body:

```typescript
// Build general_tools from spec
const generalTools: any[] = [
  { type: "end_call", name: "end_call", description: "End the call when conversation is complete." }
];
if (spec.transfer_required && spec.transfer_phone_number) {
  generalTools.push({
    type: "transfer_call",
    name: "transfer_to_agent",
    description: "Transfer the call to a live agent when the lead is qualified and ready.",
    number: spec.transfer_phone_number,
  });
}

const llmPatchBody: any = { general_prompt: taskPrompt, general_tools: generalTools };
if (resolvedOpening) {
  llmPatchBody.begin_message = resolvedOpening;
}
```

### 2. `supabase/functions/run-test-run/index.ts` -- Same fix for University tests
Apply the identical `general_tools` sync in the LLM prompt injection section (around line 187), so University test calls also have the transfer tool available:

```typescript
const generalTools: any[] = [
  { type: "end_call", name: "end_call", description: "End the call when conversation is complete." }
];
if (spec?.transfer_required && spec?.transfer_phone_number) {
  generalTools.push({
    type: "transfer_call",
    name: "transfer_to_agent",
    description: "Transfer the call to a live agent when the lead is qualified and ready.",
    number: spec.transfer_phone_number,
  });
}

// Include general_tools in the LLM PATCH
body: JSON.stringify({ general_prompt: trimmedRetellPrompt, general_tools: generalTools })
```

### 3. Deploy both edge functions

## Expected Outcome
After this fix, every call (University test or campaign) will ensure the Retell LLM has:
- The correct `general_prompt` (already working)
- The correct `begin_message` (already working)
- The correct `general_tools` including `transfer_call` when transfer is enabled

The agent will then be able to actually execute the transfer to +13054332275 when a lead qualifies.

