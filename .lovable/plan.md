

## Live Call Monitor: Real-Time Transcript + Audio Listen

### Overview
Add a live monitoring panel to the Gym page that activates when a call is in progress, showing a real-time transcript word-by-word and optionally allowing you to listen to the live audio.

### How It Works

Bland AI provides two APIs for active calls:
- **Event Stream** (`GET /v1/event_stream/{call_id}`) -- Server-Sent Events delivering transcript lines as the conversation happens
- **Listen** (`POST /v1/calls/{call_id}/listen`) -- returns a WebSocket URL for streaming live audio

Both require the `BLAND_API_KEY`, so they must be proxied through a backend function.

### Changes

**1. New Edge Function: `supabase/functions/live-call-stream/index.ts`**

A backend function that accepts a `call_id` and an `action` parameter (`transcript` or `listen`):

- `action: "transcript"` -- Calls Bland's Event Stream API, fetches all events, and returns the transcript events as JSON. The frontend will poll this every 2-3 seconds to get new transcript lines.
- `action: "listen"` -- Calls Bland's Listen API (`POST /v1/calls/{call_id}/listen`) and returns the WebSocket URL (`wss://...`) to the frontend, which connects directly for live audio playback.

**2. New Component: `src/components/LiveCallMonitor.tsx`**

A panel that appears in the Gym page while a call is active (`running === true` and `contact?.bland_call_id` exists):

- **Transcript feed**: Polls the `live-call-stream` function every 2-3 seconds, displaying each transcript event as a chat bubble (distinguishing agent vs. caller by the `category` field).
- **Listen button**: Fetches the WebSocket URL from the edge function, then connects via `new WebSocket(url)` to receive raw audio chunks and plays them through the Web Audio API.
- Auto-scrolls to the latest message.
- Disappears/transitions to the final results when the call completes.

**3. Update `src/pages/GymPage.tsx`**

- Import and render `<LiveCallMonitor>` between the "Calling..." status and the results card, passing `blandCallId` and `isActive` props.
- The component only renders when `running && contact?.bland_call_id`.

**4. Update `supabase/config.toml`**

- Add `[functions.live-call-stream]` with `verify_jwt = false` to match existing function config.

### UI Layout

```text
+------------------------------------------+
|  Gym - Run Test Call                      |
|  [Agent dropdown] [Phone] [Run Test]      |
+------------------------------------------+
|  LIVE MONITOR (appears during call)       |
|  +--------------------------------------+ |
|  | Agent: "Hi, this is Maya from..."     | |
|  | Caller: "Yeah, hi..."                 | |
|  | Agent: "Great, I wanted to..."        | |
|  |  ... (auto-scrolling)                 | |
|  +--------------------------------------+ |
|  [ Listen Live ]  (headphone icon)        |
+------------------------------------------+
|  Results (appears after call ends)        |
+------------------------------------------+
```

### What stays the same
- All existing test run flow, polling, realtime subscriptions unchanged
- Results card, history, trend chart, improvement buttons unaffected
- The live monitor is purely additive and only visible during active calls

