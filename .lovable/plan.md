

## Fix: Evaluation Not Triggering for Most Calls

### Root Cause

The evaluate-call function is only triggered when `contactStatus === "completed"` (line 253 in receive-bland-webhook). But:

1. **Ramon Rojas's call**: Was incorrectly set to `contactStatus = "voicemail"` by the old answered_by bug, so evaluation was skipped entirely -- even though the call had a full transcript and qualified outcome.
2. **Going forward**: Even with the voicemail fix, the condition is too narrow. The evaluation should fire for any call that has a real transcript, regardless of the contact status label.

This explains why only 1 out of 7 calls in this campaign has evaluation data.

### Fix

**File: `supabase/functions/receive-bland-webhook/index.ts`**

Change the evaluate-call trigger condition (line 253) from:
```
if (upsertedCall?.id && transcript && contactStatus === "completed")
```
to:
```
if (upsertedCall?.id && transcript)
```

This fires evaluation for every call that has a transcript, which is the correct behavior -- voicemail calls with no real transcript will have `transcript` as null/empty, so they'll be naturally excluded.

Apply the same fix in:
- The test lab flow (line 123)
- The inbound flow (line 194)

**File: `supabase/functions/receive-retell-webhook/index.ts`**

Apply the same broadened condition for consistency.

**Data fix**: Re-trigger evaluate-call for all calls in this campaign that have transcripts but no evaluation, so Ramon Rojas and the other missed calls get scored retroactively.

### Changes

| File | Change |
|---|---|
| `supabase/functions/receive-bland-webhook/index.ts` | Remove `contactStatus === "completed"` guard from all 3 evaluate-call triggers |
| `supabase/functions/receive-retell-webhook/index.ts` | Same fix for Retell provider |
| Manual | Re-trigger evaluation for the 6 un-evaluated calls in this campaign |
