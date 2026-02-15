

## Fix Live Call Monitoring

### Problems Found

1. **Wrong API endpoint for transcripts**: The `live-call-stream` edge function uses Bland's `event_stream` endpoint, which returns system-level events (queue status, performance metrics), NOT conversation transcripts. This is why the monitor always shows "Waiting for conversation to begin..." -- the events don't contain `text`, `transcript`, or `message` fields with actual speech.

2. **Monitor missing from Test Lab**: The `LiveCallMonitor` component is only rendered in `GymPage.tsx`. The `TestLabSection.tsx` (used on the `/test` route) has no live monitoring at all.

3. **Retell calls unsupported**: The monitor only checks `bland_call_id`. When using Retell as the voice provider, `retell_call_id` is set instead, so the monitor never appears.

### Changes

#### 1. Fix `supabase/functions/live-call-stream/index.ts` -- Use correct Bland API

Replace the `event_stream` call with the **Call Details** endpoint (`GET /v1/calls/{call_id}`), which returns a `transcripts` array with `{ id, text, user, created_at }` objects during and after the call. This endpoint provides actual conversation content in real-time while the call status is `"started"`.

- The `transcripts` array contains objects like:
  ```json
  { "id": 12345, "text": "Hi, how are you?", "user": "assistant", "created_at": "2024-..." }
  ```
- Map `user: "assistant"` to `role: "agent"` and `user: "user"` to `role: "caller"`
- Keep the `listen` action unchanged (WebSocket audio works fine)

#### 2. Update `src/components/LiveCallMonitor.tsx` -- Support both providers

- Accept an optional `retellCallId` prop alongside `blandCallId`
- Use whichever ID is available to determine the active call
- For Retell calls, the transcript polling uses the same edge function (which will be extended to support Retell's API if needed), or falls back to polling `test_run_contacts.transcript` from the database
- Disable the "Listen Live" audio button for Retell calls (Retell doesn't expose a WebSocket listen endpoint the same way)

#### 3. Update `src/pages/GymPage.tsx` -- Pass both call IDs

- Pass both `bland_call_id` and `retell_call_id` from the contact to `LiveCallMonitor`
- Update the render condition from `contact?.bland_call_id` to `contact?.bland_call_id || contact?.retell_call_id`
- Add `retell_call_id` to the `TestContact` interface

#### 4. Add `LiveCallMonitor` to `src/components/TestLabSection.tsx`

- Import and render `LiveCallMonitor` for active calls in the Test Lab
- Show the monitor when any contact in the test run has status `"calling"` and a call ID
- Display it below the run controls, similar to GymPage

### Technical Details

**Bland Call Details API response structure (during live call):**
```json
{
  "call_id": "abc-123",
  "status": "started",
  "transcripts": [
    { "id": 1, "text": "Hello?", "user": "user", "created_at": "..." },
    { "id": 2, "text": "Hi there! I'm calling about...", "user": "assistant", "created_at": "..." }
  ],
  "concatenated_transcript": "user: Hello?\nassistant: Hi there!..."
}
```

**Files changed:**
| File | Change |
|---|---|
| `supabase/functions/live-call-stream/index.ts` | Switch transcript action from `event_stream` to `calls/{call_id}` endpoint, parse `transcripts` array |
| `src/components/LiveCallMonitor.tsx` | Add `retellCallId` prop, handle both providers, disable audio for Retell |
| `src/pages/GymPage.tsx` | Add `retell_call_id` to interface, pass both IDs, update render condition |
| `src/components/TestLabSection.tsx` | Import and render LiveCallMonitor for active calling contacts |

