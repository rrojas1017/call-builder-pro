

# Fix: Live Monitor Not Showing Transcripts

## Root Cause

Retell's `GET /v2/get-call/{call_id}` REST endpoint returns empty transcript fields (`transcript`, `transcript_object`, `transcript_with_tool_calls`) while a call is active. These fields are only populated **after the call ends**. The current polling approach will never show live data.

## Solution

Two-part fix:

### 1. Add diagnostic logging to confirm the issue (immediate)

Add `console.log` of the raw Retell response keys in `live-call-stream` so we can see exactly what fields Retell returns during an active call. This will confirm whether any live transcript data is available via REST.

### 2. Use Retell's WebSocket for real-time transcripts (main fix)

Retell provides a **Server WebSocket** that streams transcript events in real-time during active calls. However, edge functions cannot maintain persistent WebSocket connections.

**Alternative approach -- store transcripts from the webhook:**

The Retell webhook (`receive-retell-webhook`) already receives `call_analyzed` and `call_ended` events, but it does NOT receive **mid-call transcript updates**. The most practical approach is:

- **Option A: Use the Retell `register-call` webhook with `transcript_websocket_url`** -- Retell can push transcript updates to a webhook URL during the call. This requires registering a webhook endpoint that receives streaming transcript data.

- **Option B (Simpler): Poll the database instead of Retell's API** -- Since the webhook fires `call_ended` with the full transcript, and during the call we have no REST transcript, we should change the Live Monitor to:
  1. During "calling" status: show an animated "Agent is speaking..." indicator instead of a dead "Waiting for conversation" message
  2. Once the call ends and the webhook writes the transcript to `test_run_contacts.transcript`, display the full transcript immediately from the database

This is the pragmatic fix since Retell's REST API simply does not support live transcripts.

**Recommended: Option B** -- it's honest about the limitation, provides a better UX, and requires no new infrastructure.

## Changes

### `src/components/LiveCallMonitor.tsx`
- Remove the polling to `live-call-stream` edge function (it returns empty data during calls)
- Instead, poll `test_run_contacts` directly from the database for the transcript field
- During "calling" status with no transcript yet, show an animated "Call in progress" indicator with a pulsing audio wave animation instead of "Waiting for conversation"
- Once `transcript` is populated (after call ends), parse and display it as chat bubbles
- Rename section from "Live Monitor" to "Call Transcript" to set correct expectations

### `supabase/functions/live-call-stream/index.ts`
- Add `console.log` of raw Retell response keys for diagnostics (keep for future debugging)
- Keep the function working for post-call transcript retrieval (used elsewhere)

### `src/pages/UniversityPage.tsx`
- Pass `contactId` to LiveCallMonitor (already done)
- Pass `status` so the monitor knows when to show "in progress" vs transcript

## Technical Details

### LiveCallMonitor new behavior

```text
if status == "calling" and no transcript:
  Show animated "Call in progress..." with pulsing indicator
  Poll test_run_contacts.transcript every 3s

if transcript available:
  Parse "Agent: ..." / "User: ..." lines into chat bubbles
  Show full conversation

if status == "completed" and no transcript:
  Show "No transcript available"
```

### Diagnostic logging (live-call-stream)

```text
console.log("Retell response keys:", Object.keys(data));
console.log("transcript type:", typeof data.transcript, "length:", data.transcript?.length);
console.log("transcript_object:", Array.isArray(data.transcript_object), data.transcript_object?.length);
console.log("transcript_with_tool_calls:", Array.isArray(data.transcript_with_tool_calls), data.transcript_with_tool_calls?.length);
```

## Files to Modify
- `src/components/LiveCallMonitor.tsx` -- Rewrite to poll database instead of edge function; add animated in-progress state
- `supabase/functions/live-call-stream/index.ts` -- Add diagnostic logging

