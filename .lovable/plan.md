

# Fix Live Transcription + Verify Transfer/Persona Fixes

## Status of Transfer & Persona Issues

The transfer_call format fix and voice/name sync are **already deployed** as of 06:03 UTC. The test you saw was run at 05:57 UTC -- 6 minutes BEFORE the deployment completed. A new test will use the corrected code.

No code changes needed for transfer or persona -- just a re-test.

## What Needs Fixing: Live Transcription

The `LiveCallMonitor` component only polls the database (`test_run_contacts.transcript`), which is populated by the webhook AFTER the call ends. During an active call, it just shows "Call in progress" with no transcript.

### Fix: Dual-polling strategy in `LiveCallMonitor.tsx`

**During active calls** (status = "calling" or "queued"):
- Poll the `live-call-stream` edge function every 3 seconds
- This calls Retell's `get-call` API and returns whatever transcript data is available
- Show transcript lines as chat bubbles as they arrive

**After the call ends** (status changes):
- Switch to polling the database for the final complete transcript
- This is the reliable source once the webhook has fired

### Technical Changes

**File: `src/components/LiveCallMonitor.tsx`**

Replace the single database polling effect with two effects:

1. **Retell API polling (during active calls):**
```typescript
useEffect(() => {
  if (!isActive || !retellCallId || !isCalling) return;

  const fetchLiveTranscript = async () => {
    const { data } = await supabase.functions.invoke("live-call-stream", {
      body: { call_id: retellCallId, action: "transcript" },
    });
    if (data?.transcripts?.length > 0) {
      setLines(data.transcripts);
    }
  };

  fetchLiveTranscript();
  const interval = setInterval(fetchLiveTranscript, 3000);
  return () => clearInterval(interval);
}, [isActive, retellCallId, isCalling]);
```

2. **Database polling (after call ends):**
```typescript
useEffect(() => {
  if (!isActive || !contactId || isCalling) return;

  const fetchTranscript = async () => {
    const { data } = await supabase
      .from("test_run_contacts")
      .select("transcript, status")
      .eq("id", contactId)
      .single();
    if (data?.transcript) {
      setTranscript(data.transcript);
      setLines(parseTranscript(data.transcript));
    }
  };

  fetchTranscript();
  const interval = setInterval(fetchTranscript, 3000);
  return () => clearInterval(interval);
}, [isActive, contactId, isCalling]);
```

The `live-call-stream` edge function already handles parsing Retell's `transcript`, `transcript_object`, and `transcript_with_tool_calls` fields, so no backend changes are needed.

## Files to Modify
- `src/components/LiveCallMonitor.tsx` -- Add dual-polling (Retell API during calls, DB after)

## Expected Outcome
- During active calls: transcript bubbles appear in real-time as the conversation happens
- After call ends: full transcript loads from the database
- Agent will say "Alex" (not Ashley) because the LLM patch will now succeed
- Transfer will work because the correct tool schema is deployed

