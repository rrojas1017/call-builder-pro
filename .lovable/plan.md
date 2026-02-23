

# Fix Live Call Transcription

## Root Cause

The Retell REST API (`GET /v2/get-call/{call_id}`) does not expose transcript data while a call is ongoing. All transcript fields (`transcript`, `transcript_object`, `transcript_with_tool_calls`) return `undefined` until the call reaches `ended` status. This is a documented Retell API limitation -- live transcripts are only available through their Custom LLM WebSocket integration, which requires a persistent WebSocket server (not feasible with serverless edge functions).

## What We Can Do

Since true real-time streaming isn't possible with the current architecture, we can dramatically improve the experience with these changes:

### 1. Show the opening line immediately when the call starts

When `run-test-run` initiates the call, we already know the `begin_message` (opening line). Store it on the `test_run_contacts` record right away so the Live Monitor can display it instantly instead of showing a blank "waiting" state.

**File**: `supabase/functions/run-test-run/index.ts`
- After successfully creating the Retell call, write the `begin_message` as an initial transcript to the contact record

### 2. Use Supabase Realtime for instant transcript updates

Instead of polling the database every 3 seconds after the call ends, subscribe to real-time changes on the `test_run_contacts` table. When the webhook writes the transcript, it appears on-screen within milliseconds.

**File**: `src/components/LiveCallMonitor.tsx`
- Replace database polling with a Supabase Realtime subscription on the contact row
- Show the opening line from the DB immediately during the call
- Transcript appears instantly when the webhook fires (no 3-second delay)
- Remove the edge function polling entirely (it never works during live calls)

### 3. Enable Realtime on test_run_contacts

**Database migration**: Add the `test_run_contacts` table to the Supabase Realtime publication so changes are pushed to connected clients.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.test_run_contacts;
```

### 4. Improve "in progress" UX messaging

Update the waiting message to be more accurate:

- During call: "Call in progress -- opening line delivered. Full transcript will appear when the call completes."
- Show the known opening line as the first bubble immediately

### 5. Remove dead REST polling

The `live-call-stream` edge function polling during active calls is unnecessary since it never returns data. Remove that code path from `LiveCallMonitor` and only keep the Realtime subscription.

## Technical Details

### LiveCallMonitor changes

```text
Current flow:
  Call starts --> poll REST API every 3s --> always empty --> call ends --> poll DB every 3s --> transcript appears

New flow:
  Call starts --> show opening line immediately --> subscribe to Realtime --> webhook fires --> transcript appears instantly
```

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/run-test-run/index.ts` | Store `begin_message` as initial transcript snippet on the contact row |
| `src/components/LiveCallMonitor.tsx` | Replace polling with Realtime subscription, show opening line immediately |
| Database migration | Enable Realtime on `test_run_contacts` table |

### What This Won't Do

- This won't show word-by-word live transcription during the call. That requires Retell's Custom LLM WebSocket integration with a persistent server, which is a much larger architectural change.
- The full transcript still arrives when the call ends, but it now appears instantly (via Realtime) instead of with a 3-6 second polling delay.

## Expected Outcome

- Opening line appears as a chat bubble the moment the call connects
- Full transcript appears within 1 second of the call ending (instead of up to 6 seconds)
- No more wasted API calls to Retell during the call
- Clearer messaging about what to expect during live calls

