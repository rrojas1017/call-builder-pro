

# Fix: Voice, Persona Name, and Transfer Not Syncing to Retell

## The Three Problems

1. **Wrong voice**: DB has `minimax-Ashley` but Retell agent shows `11labs-Adrian` because the pre-flight sync in `run-test-run` and `tick-campaign` never syncs `voice_id` to the Retell agent before making calls.

2. **Wrong persona name**: The agent says "Ashley" instead of "Alex" because the `transfer_call` tool format is STILL wrong (`type: "phone_number"` instead of `type: "predefined"`, missing `transfer_option`). This causes Retell to reject the entire LLM PATCH -- including `general_prompt` (with "Alex") and `begin_message`.

3. **No transfers**: Same root cause -- Retell rejects the LLM patch, so the `transfer_call` tool never gets configured.

## Fixes

### 1. Fix `transfer_call` format in ALL three files

The previous fix used `type: "phone_number"` which Retell still rejects. Must use `type: "predefined"` and include `transfer_option`:

```typescript
// CORRECT format (all three files)
generalTools.push({
  type: "transfer_call",
  name: "transfer_to_agent",
  description: "Transfer the call to a live agent when the lead is qualified and ready.",
  transfer_destination: {
    type: "predefined",
    number: spec.transfer_phone_number,
    ignore_e164_validation: false,
  },
  transfer_option: {
    type: "cold_transfer",
    show_transferee_as_caller: false,
  },
});
```

**Files:**
- `supabase/functions/run-test-run/index.ts` (lines 220-230)
- `supabase/functions/tick-campaign/index.ts` (lines 240-250)
- `supabase/functions/manage-retell-agent/index.ts` (lines 148-158, inside `buildLlmBody`)

### 2. Sync `voice_id` and `agent_name` in pre-flight

Add `voice_id` and `agent_name` to the agent-level PATCH in `run-test-run` (around line 158) and `tick-campaign` so the Retell agent always matches the DB spec before calls start:

```typescript
// Add to the agentPatch object in pre-flight
if (spec?.voice_id) agentPatch.voice_id = spec.voice_id;
if (spec?.persona_name) agentPatch.agent_name = spec.persona_name;
```

**Files:**
- `supabase/functions/run-test-run/index.ts` (around line 158-160)
- `supabase/functions/tick-campaign/index.ts` (same pre-flight section)

## Expected Outcome

After these fixes:
- The Retell agent will use `minimax-Ashley` voice (matching the UI selection)
- The LLM PATCH will succeed, injecting the prompt with "Alex" as persona name
- The `begin_message` will say "Hi there, this is Alex..." 
- The `transfer_call` tool will be properly configured for call transfers

## Files to Modify
- `supabase/functions/run-test-run/index.ts` -- Fix transfer format + add voice/name sync
- `supabase/functions/tick-campaign/index.ts` -- Fix transfer format + add voice/name sync
- `supabase/functions/manage-retell-agent/index.ts` -- Fix transfer format in `buildLlmBody`

