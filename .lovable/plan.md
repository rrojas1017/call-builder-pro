

# Fix: Agent Name, Transfer, and Extracted Data Issues

## Root Cause (All Three Issues)

The LLM prompt injection in `run-test-run` **failed completely** because the Retell API rejected the `general_tools` payload. The error:

```text
general_tools/1/type must be equal to one of the allowed values: end_call,
general_tools/1 must have required property 'transfer_destination'
```

The code sends `{ type: "transfer_call", number: "+13054332275" }` but Retell's API requires `{ type: "transfer_call", transfer_destination: { type: "phone_number", number: "+13054332275" } }`.

Because the **entire LLM PATCH was rejected**, none of the following took effect:
- `general_prompt` (new prompt with "Alex") -- so old "Ashley" prompt remained
- `general_tools` (transfer tool) -- so no transfer capability
- `begin_message` (opening line with "Alex") -- so old "Ashley" greeting remained

The `tick-campaign` function has the exact same bug (line 242-246).

The extracted data and evaluation being null is a secondary issue: the webhook processed the call, but the `call_analyzed` event's `call_analysis` field likely returned minimal data since the `post_call_analysis_data` was only applied at the agent level (which is fine), but the evaluate-call function may not have fired properly for the cancelled test contact.

## Fix

### 1. `supabase/functions/run-test-run/index.ts` (lines 220-227)
Fix the transfer_call tool format to match Retell's API schema:

```typescript
// Before (WRONG):
generalTools.push({
  type: "transfer_call",
  name: "transfer_to_agent",
  description: "Transfer the call to a live agent when the lead is qualified and ready.",
  number: spec.transfer_phone_number,
});

// After (CORRECT):
generalTools.push({
  type: "transfer_call",
  name: "transfer_to_agent",
  description: "Transfer the call to a live agent when the lead is qualified and ready.",
  transfer_destination: {
    type: "phone_number",
    number: spec.transfer_phone_number,
  },
});
```

### 2. `supabase/functions/tick-campaign/index.ts` (lines 240-247)
Same fix for the campaign flow:

```typescript
generalTools.push({
  type: "transfer_call",
  name: "transfer_to_agent",
  description: "Transfer the call to a live agent when the lead is qualified and ready.",
  transfer_destination: {
    type: "phone_number",
    number: spec.transfer_phone_number,
  },
});
```

### 3. `supabase/functions/manage-retell-agent/index.ts`
Check and fix the same pattern wherever `transfer_call` tools are built (for consistency during agent creation/sync).

## Expected Outcome

After this fix:
- The LLM PATCH will succeed, injecting the correct prompt with "Alex" as persona name
- The `begin_message` will be set with the resolved opening line using "Alex"
- The `transfer_call` tool will be properly configured, enabling call transfers
- Extracted data will flow correctly since the `post_call_analysis_data` (set at agent level) is already correct

## Files to Modify
- `supabase/functions/run-test-run/index.ts` -- Fix transfer_call tool format
- `supabase/functions/tick-campaign/index.ts` -- Fix transfer_call tool format
- `supabase/functions/manage-retell-agent/index.ts` -- Verify/fix same pattern for consistency

