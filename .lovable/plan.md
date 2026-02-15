

## Fix: Taladiga Campaign Not Dialing

### Problem
The campaign is stuck in "running" with 8 queued contacts but no calls are being made. The Bland Batch API is returning this error:

```
BATCH_V2_CREATE_VALIDATION_ERROR: Either one of a `task`, `pathway_id`, or `persona_id`
property must be provided in the global object as a fallback
```

### Root Cause
In `supabase/functions/tick-campaign/index.ts`, the `task` prompt is only included inside each individual `call_object` (line 235), but Bland's V2 batch API **requires** a `task` in the `global` settings object as a fallback -- even if every call object already has one.

The `globalSettings` object (line 250) is missing the `task` field entirely.

### Fix

**File: `supabase/functions/tick-campaign/index.ts`**

Add the base `task` prompt to the `globalSettings` object (around line 253), right alongside the other global properties:

```typescript
const globalSettings: any = {
  task: task,   // <-- add this line
  record: true, webhook: webhookUrl,
  summary_prompt: "...",
  model: "base", language: spec.language || "en",
};
```

Also add `first_sentence` to globalSettings for the same reason:

```typescript
globalSettings.first_sentence = spec.opening_line || "Hey there, you got a quick minute?";
```

This is a one-line fix in the edge function. Once deployed, the campaign will start dialing on the next tick. You can re-trigger it by calling `start-campaign` again or waiting for the next automatic tick.
