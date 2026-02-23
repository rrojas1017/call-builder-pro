

# Fix: AI Optimization Engine Producing Invalid Recommendations

## Problem

The "Optimize with AI" feature is generating recommendations with the **wrong Retell API format** for `transfer_call` tools and invalid voice IDs. When applied, Retell rejects everything, resulting in "0 settings updated."

Two specific errors from logs:
- `general_tools/1 must have required property 'transfer_option'` -- wrong tool format
- `Item 11labs-Ashley not found from voice` -- recommending a voice that doesn't exist

## Root Cause

1. The `RETELL_BEST_PRACTICES` prompt doesn't document the correct `transfer_call` schema, so the AI hallucinates the format
2. The apply logic blindly sends AI-recommended values to Retell without validation
3. No guard against recommending voice IDs that don't match the current voice provider

## Fix

### `supabase/functions/optimize-retell-agent/index.ts`

**A. Update `RETELL_BEST_PRACTICES` with correct transfer_call format:**

Add explicit documentation of the required transfer_call schema:

```text
### transfer_call Tool Format (REQUIRED)
{
  "type": "transfer_call",
  "name": "transfer_to_agent",
  "description": "Transfer the call...",
  "transfer_destination": {
    "type": "predefined",
    "number": "+1XXXXXXXXXX",
    "ignore_e164_validation": false
  },
  "transfer_option": {
    "type": "cold_transfer",
    "show_transferee_as_caller": false
  }
}
```

**B. Add validation before applying `general_tools` patches:**

When the AI recommends `general_tools`, intercept and fix any `transfer_call` entries to ensure they have the correct `transfer_destination` (with `type: "predefined"`) and `transfer_option` structure. Use the phone number from `spec.transfer_phone_number` as the source of truth rather than whatever the AI hallucinates.

**C. Skip voice_id recommendations:**

Add the `voice_id` param to a "skip list" so the optimizer never tries to change the voice -- voice selection is a user choice, not something AI should override. This prevents the `11labs-Ashley not found` error.

**D. Add system prompt instruction:**

Tell the AI to never recommend changing `voice_id` and to always use the exact `transfer_call` format from the best practices document.

## Files to Modify
- `supabase/functions/optimize-retell-agent/index.ts` -- Update best practices doc, add apply-time validation, skip voice changes

