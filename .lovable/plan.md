

# Live Call Transcription via Retell Custom LLM WebSocket

## Why It Doesn't Work Today

The Retell REST API (`GET /v2/get-call/{call_id}`) returns empty transcript fields during active calls. Transcript data only appears after the call reaches `ended` status. There are no mid-call transcript webhook events either. This is a fundamental Retell API limitation.

## Solution: Custom LLM WebSocket

Retell supports a **Custom LLM WebSocket** integration where Retell connects to YOUR server during the call and streams live transcript updates in real time. Instead of using Retell's built-in "single prompt" agent, we run our own LLM that receives transcript updates and sends back responses.

```text
Current architecture:
  Retell manages LLM internally --> no live transcript access

New architecture:
  Retell <--WebSocket--> Our Edge Function <--writes transcript--> Database <--Realtime--> UI
                              |
                              +--> Calls Lovable AI to generate agent responses
```

## Implementation Steps

### 1. Create Custom LLM WebSocket Edge Function

**New file**: `supabase/functions/retell-llm-ws/index.ts`

This edge function upgrades HTTP to WebSocket and handles the Retell Custom LLM protocol:

- **On connect**: Retell sends `call_details` with metadata (test_run_contact_id, org_id, etc.)
- **On `update_only` events**: Retell sends live transcript updates. We write the latest transcript to `test_run_contacts.transcript` in the database.
- **On `response_required` events**: We send the transcript to Lovable AI (using the agent's `general_prompt` as the system prompt) and stream the response back to Retell.
- **On `reminder_required` events**: We send a brief follow-up response.

The function uses Deno's native WebSocket support, which is available in Supabase Edge Functions.

### 2. Register the Custom LLM with Retell

**Modified file**: `supabase/functions/manage-retell-agent/index.ts`

When creating or updating a Retell LLM, switch from `model`-based configuration to `custom_llm_websocket_url` pointing to our new edge function:

```text
wss://<project-id>.supabase.co/functions/v1/retell-llm-ws
```

This replaces the current approach of setting `general_prompt` on Retell's built-in LLM.

### 3. Build Agent Responses with Lovable AI

**Within the WebSocket function**, when Retell requests a response:

- Construct a system prompt from the agent spec (same `buildTaskPrompt` logic already used)
- Send the full transcript history to Lovable AI (e.g., `google/gemini-2.5-flash` for speed)
- Stream the response tokens back to Retell via WebSocket

### 4. Write Live Transcript to Database

Every time Retell sends a transcript update (which happens after each utterance), the WebSocket function writes the formatted transcript to `test_run_contacts.transcript`. Since Realtime is already enabled on this table, the `LiveCallMonitor` component picks up changes instantly -- no polling needed.

### 5. Update LiveCallMonitor UI

**Modified file**: `src/components/LiveCallMonitor.tsx`

- Show a typing indicator when a new user utterance arrives but the agent hasn't responded yet
- Update the "LIVE" badge to pulse while transcript is actively streaming
- Remove the static "transcript will appear when the call completes" message

### 6. Update Agent Sync Logic

**Modified file**: `supabase/functions/manage-retell-agent/index.ts`

- When syncing agent configuration, create/update the LLM with `custom_llm_websocket_url` instead of `model` and `general_prompt`
- Transfer tool definitions (like `transfer_call`) remain the same -- they're passed to the Custom LLM via the WebSocket protocol

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/retell-llm-ws/index.ts` | **New** -- WebSocket handler for Retell Custom LLM protocol |
| `supabase/functions/manage-retell-agent/index.ts` | Switch LLM config from built-in model to custom WebSocket URL |
| `src/components/LiveCallMonitor.tsx` | Add typing indicator, remove "wait for completion" messaging |
| `supabase/config.toml` | Add `[functions.retell-llm-ws]` with `verify_jwt = false` |

## What Changes for Users

- During a live call, each utterance (both agent and caller) appears in the transcript panel within 1-2 seconds of being spoken
- The agent still follows the same persona, opening line, and qualification rules -- the prompt logic is identical
- Transfer, voicemail detection, and all webhook flows remain unchanged

## Risks and Considerations

- **LLM latency**: Response time now depends on our AI call speed. Using `gemini-2.5-flash` keeps latency low (~1-2s). Retell's built-in LLM may have been faster since it's co-located.
- **Edge function timeout**: Supabase Edge Functions have a ~150s execution limit. For calls longer than ~2.5 minutes, the WebSocket may disconnect. We can mitigate with Retell's auto-reconnect or by keeping responses fast.
- **Rollback**: If issues arise, we can revert the LLM config back to Retell's built-in model with a single sync operation.
- **Cost**: Each utterance now incurs an AI API call, versus Retell handling it internally. This adds marginal cost per call.

## Testing Plan

1. Create a test agent and run a call to verify the WebSocket connects and transcript streams live
2. Verify the agent responds correctly using the same qualification logic
3. Confirm transfer functionality still works through the Custom LLM protocol
4. Test edge function timeout behavior on longer calls

